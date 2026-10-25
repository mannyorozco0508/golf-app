// HardPanDocScanPlugin.swift - the paper scorecard camera (URGENT-066 feature 2, scorecard-scan-ai).
// Replaces the old on-device Tesseract scanner (removed for Consumer 1.0): this only TAKES the photo.
// Reading it is the server's job (functions/api/scorecard-scan.js); the golfer checks every number on
// the confirm grid (gps-scan-grid.js) and nothing is saved until "Use these scores".
//
// JS (gps-scan-client.js) sees it as Capacitor.Plugins.HardPanDocScan:
//   available() -> { available }   VisionKit's document camera works on this device (false in the Simulator)
//   scan()      -> { cancelled: true } | { image: <base64 JPEG>, width, height, bytes }
//               rejects with code "unavailable" (no document camera) / "busy" / "failed"
//
// VisionKit's VNDocumentCameraViewController finds the card's edges, crops, straightens and evens out
// glare. The FIRST page is returned, scaled down to a 1800 px long edge (inside the 1600-2000 px the
// handoff asks for), JPEG quality 0.8 - about 300-600 KB. No photo is saved to the phone or to Photos,
// and this plugin sends nothing anywhere: the image goes back to the page, and only to the page.
// Camera permission: NSCameraUsageDescription in App/Info.plist (iOS asks the first time scan() runs).
// No new package: a local plugin in the App target, registered in HardPanBridgeViewController.swift
// like HardPanLiveActivity, so capacitor.config.json's ios.includePlugins is unchanged.

import Foundation
import UIKit
import Capacitor
#if canImport(VisionKit)
import VisionKit
#endif

@objc(HardPanDocScanPlugin)
public class HardPanDocScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardPanDocScanPlugin"
    public let jsName = "HardPanDocScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
    ]

    static let longEdge: CGFloat = 1800
    static let quality: CGFloat = 0.8

    private var pending: CAPPluginCall?
    #if canImport(VisionKit)
    private var delegateRef: AnyObject?
    #endif

    @objc func available(_ call: CAPPluginCall) {
        #if canImport(VisionKit)
        call.resolve(["available": VNDocumentCameraViewController.isSupported])
        #else
        call.resolve(["available": false])
        #endif
    }

    @objc func scan(_ call: CAPPluginCall) {
        #if canImport(VisionKit)
        guard VNDocumentCameraViewController.isSupported else {
            call.reject("This device has no document camera.", "unavailable"); return
        }
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("A scan is already open.", "busy"); return }
            guard let host = self.bridge?.viewController else { call.reject("No screen to show the camera on.", "failed"); return }
            self.pending = call
            let cam = VNDocumentCameraViewController()
            let d = ScanDelegate(owner: self)
            self.delegateRef = d
            cam.delegate = d
            cam.modalPresentationStyle = .fullScreen
            host.present(cam, animated: true)
        }
        #else
        call.reject("This device has no document camera.", "unavailable")
        #endif
    }

    // ---- the result ------------------------------------------------------------------
    fileprivate func finish(_ image: UIImage?, cancelled: Bool, error: Error?, from cam: UIViewController) {
        cam.dismiss(animated: true) {
            guard let call = self.pending else { return }
            self.pending = nil
            #if canImport(VisionKit)
            self.delegateRef = nil
            #endif
            if cancelled { call.resolve(["cancelled": true]); return }
            if let error = error { call.reject(error.localizedDescription, "failed"); return }
            guard let img = image, let out = HardPanDocScanPlugin.jpeg(img) else { call.reject("Could not read the photo.", "failed"); return }
            call.resolve(["image": out.data.base64EncodedString(), "width": Int(out.size.width), "height": Int(out.size.height), "bytes": out.data.count])
        }
    }

    // Downscale to the long edge (never up) and encode. Pure, so the size rule lives in one place.
    static func jpeg(_ img: UIImage) -> (data: Data, size: CGSize)? {
        let w = img.size.width * img.scale, h = img.size.height * img.scale
        guard w > 0, h > 0 else { return nil }
        let k = min(1, longEdge / max(w, h))
        let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = true
        let scaled = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = scaled.jpegData(compressionQuality: quality) else { return nil }
        return (data, size)
    }
}

#if canImport(VisionKit)
private final class ScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
    weak var owner: HardPanDocScanPlugin?
    init(owner: HardPanDocScanPlugin) { self.owner = owner }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        owner?.finish(scan.pageCount > 0 ? scan.imageOfPage(at: 0) : nil, cancelled: scan.pageCount == 0, error: nil, from: controller)
    }
    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        owner?.finish(nil, cancelled: true, error: nil, from: controller)
    }
    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        owner?.finish(nil, cancelled: false, error: error, from: controller)
    }
}
#endif
