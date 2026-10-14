import Foundation
import Vision
import AppKit

struct Page: Encodable { let file: String; let lines: [String] }
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
var pages: [Page] = []
for url in urls {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    do {
        try VNImageRequestHandler(url: url).perform([request])
        pages.append(Page(file: url.lastPathComponent, lines: (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }))
    } catch {
        FileHandle.standardError.write(Data("\(url.lastPathComponent): \(error)\n".utf8))
        pages.append(Page(file: url.lastPathComponent, lines: []))
    }
}
FileHandle.standardOutput.write(try JSONEncoder().encode(pages))
