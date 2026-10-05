// The Objective-C bridge Capacitor reads at runtime to find the plugin and its
// methods. Without this file the plugin class exists, compiles, and is invisible
// to the web layer.
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HardPanLiveActivityPlugin, "HardPanLiveActivity",
    CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
)
