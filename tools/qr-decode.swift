// An INDEPENDENT QR decoder for the QR guard: Apple's Vision framework, the
// same class of decoder the iPhone camera uses. Reading our own encoder back
// with our own decoder would prove only that the two agree.
//
//   swift tools/qr-decode.swift <image.png>
//
// Prints one decoded payload per line. Exit 0 if at least one was found, 3 if
// the image decoded to nothing, 2 if the image could not be read.
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else { FileHandle.standardError.write("usage: qr-decode.swift <image>\n".data(using: .utf8)!); exit(2) }
let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let tiff = img.tiffRepresentation,
      let bmp = NSBitmapImageRep(data: tiff),
      let cg = bmp.cgImage else {
    FileHandle.standardError.write("cannot read image: \(path)\n".data(using: .utf8)!)
    exit(2)
}
let req = VNDetectBarcodesRequest()
req.symbologies = [.qr]
do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(2)
}
let found = (req.results ?? []).compactMap { $0.payloadStringValue }
for s in found { print(s) }
exit(found.isEmpty ? 3 : 0)
