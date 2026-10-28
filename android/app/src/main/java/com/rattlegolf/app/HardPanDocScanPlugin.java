package com.rattlegolf.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.List;

// THE PAPER SCORECARD CAMERA ON ANDROID (Saturday doc-scan job, Manny Oct 27 2026).
// The Android twin of gps-beta/ios/App/PhoneBridge/HardPanDocScanPlugin.swift, with the SAME contract,
// so gps-scan-client.js needs no change: once "HardPanDocScan" is in the app, nativeCameraHere() is true
// and both scans show - the score scan (gps-scan-grid.js) and 080 Scan the scorecard (gps-course-scan.js).
//   available() -> { available: true|false }   false without Google Play services
//   scan()      -> { image: base64 JPEG, width, height, bytes } | { cancelled: true }
//                  rejects "unavailable" (no scanner here -> the JS falls back to a file pick),
//                  "busy" (one already open) or "failed".
// Google ML Kit Document Scanner (free, on the phone): Play services shows its own camera screen and
// hands back the page, so this app asks for NO camera permission. One page, no gallery import.
// JPEG as iOS: long edge down to 1800 px (never up), quality 80. Nothing is saved to the phone: the
// scanner's own cache file is read once and deleted.
@CapacitorPlugin(name = "HardPanDocScan")
public class HardPanDocScanPlugin extends Plugin {

    static final int LONG_EDGE = 1800;
    static final int QUALITY = 80;

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        // Registered while the activity is being created (Capacitor loads plugins in onCreate), as
        // registerForActivityResult requires. An IntentSender cannot go through Capacitor's own
        // startActivityForResult, hence the launcher.
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onResult);
    }

    private boolean playServicesHere() {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", playServicesHere());
        call.resolve(r);
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!playServicesHere()) { call.reject("This device has no document camera.", "unavailable"); return; }
        if (pending != null) { call.reject("A scan is already open.", "busy"); return; }
        Activity act = getActivity();
        if (act == null || launcher == null) { call.reject("No screen to show the camera on.", "failed"); return; }
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_BASE)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        pending = call;
        scanner.getStartScanIntent(act)
            .addOnSuccessListener(sender -> launcher.launch(new IntentSenderRequest.Builder(sender).build()))
            .addOnFailureListener(e -> {
                PluginCall c = pending;
                pending = null;
                // The scanner module could not start here (not downloaded and no network, an unsupported
                // device): the same "unavailable" as an iPhone without VisionKit, so the JS picks a file.
                if (c != null) c.reject("This device has no document camera.", "unavailable");
            });
    }

    private void onResult(ActivityResult result) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
        List<GmsDocumentScanningResult.Page> pages = scan == null ? null : scan.getPages();
        if (pages == null || pages.isEmpty()) { call.reject("Could not read the photo.", "failed"); return; }
        Uri uri = pages.get(0).getImageUri();
        try {
            Encoded out = jpeg(uri);
            if (out == null) { call.reject("Could not read the photo.", "failed"); return; }
            JSObject r = new JSObject();
            r.put("image", Base64.encodeToString(out.data, Base64.NO_WRAP));
            r.put("width", out.width);
            r.put("height", out.height);
            r.put("bytes", out.data.length);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read the photo.", "failed");
        } finally {
            // The scanner's cache file: read once, never kept.
            try { if ("file".equals(uri.getScheme()) && uri.getPath() != null) new java.io.File(uri.getPath()).delete(); } catch (Exception ignored) {}
        }
    }

    static final class Encoded {
        final byte[] data; final int width; final int height;
        Encoded(byte[] d, int w, int h) { data = d; width = w; height = h; }
    }

    // Downscale to the long edge (never up), upright, and encode - the iOS size rule.
    private Encoded jpeg(Uri uri) throws Exception {
        Bitmap src;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) { src = BitmapFactory.decodeStream(in); }
        if (src == null) return null;
        int rot = 0;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            rot = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        } catch (Exception ignored) {}
        int w = src.getWidth(), h = src.getHeight();
        if (w <= 0 || h <= 0) return null;
        float k = Math.min(1f, (float) LONG_EDGE / Math.max(w, h));
        Matrix m = new Matrix();
        m.postScale(k, k);
        if (rot != 0) m.postRotate(rot);
        Bitmap out = Bitmap.createBitmap(src, 0, 0, w, h, m, true);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, QUALITY, bos);
        int ow = out.getWidth(), oh = out.getHeight();
        if (out != src) out.recycle();
        src.recycle();
        return new Encoded(bos.toByteArray(), ow, oh);
    }
}
