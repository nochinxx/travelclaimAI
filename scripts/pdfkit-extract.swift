import Foundation
import PDFKit

struct PageText: Encodable {
    let page: Int
    let text: String
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: pdfkit-extract <pdf-path>\n", stderr)
    exit(64)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])

guard let document = PDFDocument(url: url) else {
    fputs("Unable to open PDF: \(url.path)\n", stderr)
    exit(65)
}

var pages: [PageText] = []
for index in 0..<document.pageCount {
    let text = document.page(at: index)?.string ?? ""
    pages.append(PageText(page: index + 1, text: text))
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]
let data = try encoder.encode(pages)
FileHandle.standardOutput.write(data)
