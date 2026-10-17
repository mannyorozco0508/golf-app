package com.rattlegolf.app;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // THE WEBVIEW NEVER DRAWS UNDER THE STATUS BAR OR THE GESTURE BAR (android-gps,
    // 2026-10-17). targetSdk 36 is edge-to-edge, and Capacitor's SystemBars plugin in
    // its default "css" mode passed the insets through to the page - which scrolled
    // under a transparent status bar - and logged "Error injecting safe area CSS" on
    // every launch, because its first injection runs before the document exists.
    //
    // capacitor.config.ts sets SystemBars.insetsHandling = 'disable' (Android reads it;
    // iOS has no such key), so the plugin injects nothing and sets no listener. This
    // one pads the WebView's frame by the system bars, the display cutout and the
    // keyboard, so the page sits between the bars and env(safe-area-inset-*) reads 0
    // there - the window's cream shows behind the status bar icons.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View frame = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(frame, (v, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(types);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            // Zero rather than CONSUMED: a consumed set stops the WebView recalculating
            // its safe area later (https://issues.chromium.org/issues/461332423).
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(types, Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(frame);
    }
}
