// HardPanVoicePlugin.swift - voice scoring (URGENT-066 feature 4). JS (gps-voice.js) sees it as
// Capacitor.Plugins.HardPanVoice. A LOCAL plugin in the App target, registered by
// HardPanBridgeViewController.capacitorDidLoad() - no npm package, nothing in includePlugins.
//
//   available()          -> { available, onDevice, speech, mic }
//   requestPermission()  -> { speech: granted|denied|restricted|notDetermined, mic: granted|denied }
//   start({ contextualStrings }) -> { ok, text, onDevice } when the golfer stops talking (1.4 s of
//                           quiet), stop() is called, or 10 s pass. Events 'voicePartial' { text }.
//   stop() / cancel()
//   intentReply({ id, status, say })   the page's answer to a Siri intent ('voiceIntent' event)
//   held() -> { items: [{ id, words, at, hole?, round? }] } / clearHeld({ id })
//
// ON THE PHONE: SFSpeechRecognizer with requiresOnDeviceRecognition whenever the phone supports it
// (supportsOnDeviceRecognition); only on a phone that can't does Apple's speech service hear the
// audio. Nothing is recorded or kept: the audio buffers go to the recognizer and are dropped.
// The microphone runs only between start and stop.

import Foundation
import Capacitor
import Speech
import AVFoundation

@objc(HardPanVoicePlugin)
public class HardPanVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardPanVoicePlugin"
    public let jsName = "HardPanVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "intentReply", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "held", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearHeld", returnType: CAPPluginReturnPromise)
    ]

    /// The running app's plugin - the Siri intents reach the page through it.
    static weak var current: HardPanVoicePlugin?

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var startCall: CAPPluginCall?
    private var lastText = ""
    private var onDevice = false
    private var quiet: Timer?
    private var cap: Timer?

    override public func load() {
        HardPanVoicePlugin.current = self
    }

    private func makeRecognizer() -> SFSpeechRecognizer? {
        if let r = recognizer { return r }
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) ?? SFSpeechRecognizer()
        return recognizer
    }

    private static func speechWord(_ s: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch s {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }
    private static func micWord() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "notDetermined"
            }
        }
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "notDetermined"
        }
    }

    @objc func available(_ call: CAPPluginCall) {
        let r = makeRecognizer()
        call.resolve(["available": r?.isAvailable ?? false,
                      "onDevice": r?.supportsOnDeviceRecognition ?? false,
                      "speech": HardPanVoicePlugin.speechWord(SFSpeechRecognizer.authorizationStatus()),
                      "mic": HardPanVoicePlugin.micWord()])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            let speech = HardPanVoicePlugin.speechWord(status)
            let done: (Bool) -> Void = { ok in call.resolve(["speech": speech, "mic": ok ? "granted" : "denied"]) }
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { ok in done(ok) }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { ok in done(ok) }
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.startCall != nil { self.finish(cancelled: true) }
            guard SFSpeechRecognizer.authorizationStatus() == .authorized, HardPanVoicePlugin.micWord() == "granted" else {
                call.resolve(["ok": false, "why": "permission"]); return
            }
            guard let rec = self.makeRecognizer(), rec.isAvailable else { call.resolve(["ok": false, "why": "unavailable"]); return }
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            self.onDevice = rec.supportsOnDeviceRecognition
            if self.onDevice { req.requiresOnDeviceRecognition = true }
            if #available(iOS 16.0, *) { req.addsPunctuation = false }
            req.contextualStrings = (call.getArray("contextualStrings", String.self) ?? []).prefix(100).map { $0 }
            let session = AVAudioSession.sharedInstance()
            do {
                // AirPods: .allowBluetooth lets their microphone be the input.
                try session.setCategory(.record, mode: .measurement, options: [.duckOthers, .allowBluetooth])
                try session.setActive(true, options: .notifyOthersOnDeactivation)
            } catch {
                call.resolve(["ok": false, "why": "audio"]); return
            }
            let input = self.engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                try? session.setActive(false, options: .notifyOthersOnDeactivation)
                call.resolve(["ok": false, "why": "nomic"]); return
            }
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in req.append(buf) }
            self.engine.prepare()
            do { try self.engine.start() } catch {
                input.removeTap(onBus: 0)
                try? session.setActive(false, options: .notifyOthersOnDeactivation)
                call.resolve(["ok": false, "why": "audio"]); return
            }
            self.request = req
            self.startCall = call
            self.lastText = ""
            self.task = rec.recognitionTask(with: req) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self, self.startCall != nil else { return }
                    if let r = result {
                        self.lastText = r.bestTranscription.formattedString
                        self.notifyListeners("voicePartial", data: ["text": self.lastText])
                        self.armQuiet()
                        if r.isFinal { self.finish(cancelled: false) }
                    } else if error != nil {
                        self.finish(cancelled: false)
                    }
                }
            }
            self.cap = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in self?.endAudio() }
        }
    }

    private func armQuiet() {
        quiet?.invalidate()
        quiet = Timer.scheduledTimer(withTimeInterval: 1.4, repeats: false) { [weak self] _ in self?.endAudio() }
    }
    /// The golfer is done: no more audio; the recognizer gives its final words (or finish after 1.5 s).
    private func endAudio() {
        guard startCall != nil else { return }
        stopAudio()
        request?.endAudio()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            if self?.startCall != nil { self?.finish(cancelled: false) }
        }
    }
    private func stopAudio() {
        quiet?.invalidate(); quiet = nil
        cap?.invalidate(); cap = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func finish(cancelled: Bool) {
        stopAudio()
        if cancelled { task?.cancel() } else { task?.finish() }
        task = nil; request = nil
        let call = startCall; startCall = nil
        let text = lastText; lastText = ""
        if cancelled { call?.resolve(["ok": false, "why": "cancelled"]) }
        else { call?.resolve(["ok": !text.isEmpty, "text": text, "onDevice": onDevice, "why": text.isEmpty ? "nothing" : ""]) }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.endAudio(); call.resolve() }
    }
    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { if self.startCall != nil { self.finish(cancelled: true) }; call.resolve() }
    }

    // ---- Siri: the page's answers, and the words held while it was asleep -----------------
    @objc func intentReply(_ call: CAPPluginCall) {
        VoiceIntentRelay.shared.answer(id: call.getString("id") ?? "", reply: call.options as? [String: Any] ?? [:])
        call.resolve()
    }
    @objc func held(_ call: CAPPluginCall) { call.resolve(["items": VoiceIntentRelay.shared.heldItems()]) }
    @objc func clearHeld(_ call: CAPPluginCall) { VoiceIntentRelay.shared.clearHeld(id: call.getString("id")); call.resolve() }

    /// Is a page listening for Siri (gps-voice.js loaded and hooked)?
    func pageListening() -> Bool { hasListeners("voiceIntent") }
    func toPage(_ data: [String: Any]) { notifyListeners("voiceIntent", data: data) }
}

/// Between the Siri intents (HardPanVoiceIntents.swift) and the page. The page is the only place the
/// round is: the intents send it the words and wait (a few seconds) for its answer. When the page
/// can't answer (iOS has paused the web view: the phone is locked or the app is in the background;
/// or the app was not running), the words are HELD here on the phone for the page to propose later.
final class VoiceIntentRelay {
    static let shared = VoiceIntentRelay()
    private let lock = NSLock()
    private var waiting: [String: (([String: Any]) -> Void)] = [:]
    private let heldKey = "hardpan_voice_held"

    struct Reply { let reached: Bool; let status: String; let say: String; let why: String }

    func ask(kind: String, words: String = "", timeout: TimeInterval = 3) async -> Reply {
        let id = UUID().uuidString
        let reachable: Bool = await MainActor.run {
            guard let p = HardPanVoicePlugin.current, p.bridge != nil else { return false }
            return p.pageListening()
        }
        if !reachable { return Reply(reached: false, status: "unreachable", say: "", why: "nopage") }
        return await withCheckedContinuation { (k: CheckedContinuation<Reply, Never>) in
            var done = false
            let finish: ([String: Any]?) -> Void = { d in
                self.lock.lock()
                if done { self.lock.unlock(); return }
                done = true; self.waiting[id] = nil
                self.lock.unlock()
                if let d = d { k.resume(returning: Reply(reached: true, status: d["status"] as? String ?? "error", say: d["say"] as? String ?? "", why: "")) }
                else { k.resume(returning: Reply(reached: false, status: "unreachable", say: "", why: "asleep")) }
            }
            lock.lock(); waiting[id] = { d in finish(d) }; lock.unlock()
            DispatchQueue.main.async {
                HardPanVoicePlugin.current?.toPage(["id": id, "kind": kind, "words": words, "at": Date().timeIntervalSince1970 * 1000])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { finish(nil) }
        }
    }
    func answer(id: String, reply: [String: Any]) {
        lock.lock(); let f = waiting[id]; lock.unlock()
        f?(reply)
    }

    // Held words: on the phone only (UserDefaults), at most 5, dropped after 2 hours.
    func hold(words: String) -> [String: Any] {
        var item: [String: Any] = ["id": UUID().uuidString, "words": words, "at": Date().timeIntervalSince1970 * 1000]
        let la = HardPanLiveActivityPlugin.snapshot   // the hole the Lock Screen shows, if a round is up
        if let h = la["hole"] as? Int { item["hole"] = h }
        if let r = la["round"] as? String, !r.isEmpty { item["round"] = r }
        var all = heldItems(); all.insert(item, at: 0)
        UserDefaults.standard.set(Array(all.prefix(5)), forKey: heldKey)
        return item
    }
    func heldItems() -> [[String: Any]] {
        let now = Date().timeIntervalSince1970 * 1000
        let all = (UserDefaults.standard.array(forKey: heldKey) as? [[String: Any]]) ?? []
        return all.filter { now - (($0["at"] as? Double) ?? 0) < 2 * 3600 * 1000 }
    }
    func clearHeld(id: String?) {
        let keep = id == nil ? [] : heldItems().filter { ($0["id"] as? String) != id }
        UserDefaults.standard.set(keep, forKey: heldKey)
    }
}
