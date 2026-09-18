#!/usr/bin/env node
// ============================================================================
// `/` ON Host: tournaments.rattlegolf.com MUST NOT BE THE CONSUMER APP.
//
// functions/index.js is the handler. tournament_host_root_test.js drives it
// with a fake context; this file measures the ROUTING — that Pages actually
// invokes that file for `/`, and that it does not swallow /tournament or
// /api. Routing is Cloudflare's code. `wrangler pages dev .` compiles the
// same Worker the deployment does.
//
//   node tools/tournament-host-check.js
//
//   exit 0   tournaments host `/` 302s to /tournament; default host `/` is
//            Live Scorecard; /tournament and /api/course-search are untouched
//   exit 1   one of those is false
//   exit 2   could not run: wrangler missing, port busy, never ready.
//            NOTHING PROVEN.
//
// Host is sent with node:http. fetch() treats Host as forbidden and would
// silently test localhost instead of the custom name.
// ============================================================================

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const PAGES_PORT = 8799;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function call({ pathname, host, method }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PAGES_PORT,
            path: pathname,
            method: method || 'GET',
            headers: host ? { Host: host } : {}
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve({
                    status: res.statusCode,
                    location: res.headers.location || null,
                    contentType: res.headers['content-type'] || '',
                    text,
                    isHtml: /^\s*<!DOCTYPE html>/i.test(text)
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    const failures = [];
    const observed = {};
    let pages = null;
    const persistDir = path.join(REPO, '.wrangler-checkstate-thost-' + process.pid);
    const bail = (why, extra) => {
        if (pages) pages.kill();
        try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch (e) {}
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    pages = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', String(PAGES_PORT),
        '--kv', 'GOLFCOURSE_KV', '--persist-to', persistDir],
        { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    pages.stdout.on('data', (d) => { log += d; });
    pages.stderr.on('data', (d) => { log += d; });

    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
        await sleep(1000);
        try { await call({ pathname: '/api/course-search?q=x' }); ready = true; }
        catch (e) { /* not up yet */ }
    }
    if (!ready) bail('wrangler pages dev never became ready on port ' + PAGES_PORT, { log: log.slice(-1200) });

    try {
        // ---- POSITIVE CONTROLS: the world this check must not change ----
        const consumerRoot = await call({ pathname: '/' });
        const tournamentPage = await call({ pathname: '/tournament' });
        const search = await call({ pathname: '/api/course-search?q=ab' });
        observed.control = {
            defaultRoot: {
                status: consumerRoot.status,
                isHtml: consumerRoot.isHtml,
                title: (consumerRoot.text.match(/<title>([^<]*)<\/title>/i) || [])[1] || null,
                hasLiveScorecard: /Live Scorecard/.test(consumerRoot.text),
                location: consumerRoot.location
            },
            tournament: {
                status: tournamentPage.status,
                isHtml: tournamentPage.isHtml,
                hasTournaments: /Tournaments/.test(tournamentPage.text),
                hasLiveScorecard: /Live Scorecard/.test(tournamentPage.text)
            },
            search: { status: search.status, bytes: search.text.length }
        };
        if (!(consumerRoot.status === 200 && consumerRoot.isHtml && /Live Scorecard/.test(consumerRoot.text))) {
            failures.push('CONTROL: default-host `/` must still be the Consumer Live Scorecard: '
                + JSON.stringify(observed.control.defaultRoot));
        }
        if (consumerRoot.location) {
            failures.push('CONTROL: default-host `/` issued a Location: ' + consumerRoot.location);
        }
        if (!(tournamentPage.status === 200 && /Tournaments/.test(tournamentPage.text))) {
            failures.push('CONTROL: `/tournament` must still be the Tournaments page: '
                + JSON.stringify(observed.control.tournament));
        }
        let searchJson = null;
        try { searchJson = JSON.parse(search.text); } catch (e) { /* left null */ }
        if (!searchJson || searchJson.reason !== 'query_too_short') {
            failures.push('CONTROL: GET /api/course-search?q=ab did not reach its handler: '
                + search.text.slice(0, 180));
        }

        const controlsGreen = failures.length === 0;

        // ---- THE CLAIM ----
        const hosted = await call({ pathname: '/', host: 'tournaments.rattlegolf.com' });
        const hostedIndex = await call({ pathname: '/index.html', host: 'tournaments.rattlegolf.com' });
        const hostedTournament = await call({ pathname: '/tournament', host: 'tournaments.rattlegolf.com' });
        const hostedHead = await call({ pathname: '/', host: 'tournaments.rattlegolf.com', method: 'HEAD' });
        observed.tournamentsHost = {
            '/': { status: hosted.status, location: hosted.location, isHtml: hosted.isHtml, bytes: hosted.text.length },
            '/index.html': { status: hostedIndex.status, location: hostedIndex.location },
            '/tournament': {
                status: hostedTournament.status,
                location: hostedTournament.location,
                hasTournaments: /Tournaments/.test(hostedTournament.text),
                hasLiveScorecard: /<title>Live Scorecard<\/title>/.test(hostedTournament.text)
            },
            'HEAD /': { status: hostedHead.status, location: hostedHead.location }
        };

        const locPath = (loc) => {
            if (!loc) return null;
            try { return new URL(loc, 'http://127.0.0.1').pathname; } catch (e) { return loc; }
        };

        if (hosted.status !== 302) {
            failures.push('tournaments.rattlegolf.com `/`: expected 302, got ' + hosted.status
                + (hosted.isHtml && /Live Scorecard/.test(hosted.text) ? ' (the Consumer Live Scorecard)' : '')
                + ' location=' + JSON.stringify(hosted.location));
        }
        if (locPath(hosted.location) !== '/tournament') {
            failures.push('tournaments.rattlegolf.com `/`: Location pathname must be /tournament, got '
                + JSON.stringify(hosted.location));
        }
        if (hosted.isHtml && /<title>Live Scorecard<\/title>/.test(hosted.text)) {
            failures.push('tournaments.rattlegolf.com `/` returned the Consumer document in the body');
        }

        const indexPath = locPath(hostedIndex.location);
        const indexOk = (hostedIndex.status === 302 && indexPath === '/tournament')
            || (hostedIndex.status === 308 || hostedIndex.status === 301)
                && (indexPath === '/' || indexPath === '/index' || indexPath === '');
        if (!indexOk && hostedIndex.status === 200 && /Live Scorecard/.test(hostedIndex.text)) {
            failures.push('tournaments.rattlegolf.com /index.html served Live Scorecard at 200');
        }

        if (hostedTournament.status !== 200 || hostedTournament.location) {
            failures.push('tournaments.rattlegolf.com /tournament must stay 200 with no Location: '
                + JSON.stringify(observed.tournamentsHost['/tournament']));
        }
        if (hostedTournament.status === 200 && /<title>Live Scorecard<\/title>/.test(hostedTournament.text)) {
            failures.push('tournaments.rattlegolf.com /tournament returned the Consumer title');
        }

        if (hostedHead.status !== 302 || locPath(hostedHead.location) !== '/tournament') {
            failures.push('HEAD tournaments.rattlegolf.com `/` (curl -sI) must 302 to /tournament: '
                + JSON.stringify(observed.tournamentsHost['HEAD /']));
        }

        console.log(JSON.stringify({
            verdict: failures.length ? 'FAIL' : 'PASS',
            controlsGreen, failures, observed
        }, null, 2));
    } catch (e) {
        bail('a request threw: ' + (e && e.message), { log: log.slice(-800) });
    }
    pages.kill();
    try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
