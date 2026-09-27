import Foundation
import Testing
import CococoJinja

@Suite struct BoundedParserTests {
    @Test func sharedCases() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let cases = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("fixtures/bounded-parser/cases.json"))) as? [[String: Any]])
        for c in cases {
            let source = try #require(c["source"] as? String)
            do {
                let ast = try ExpressionParser.parse(source, limits: .init(maxNodes: c["maxNodes"] as? Int ?? 512, maxTokens: c["maxTokens"] as? Int ?? 2048))
                let context = try JinjaValue.fromJSONData(JSONSerialization.data(withJSONObject: c["context"] ?? [:]))
                let result = try Evaluator.evaluate(ast, context: context, filters: .standard, limits: .init(maxOperations: c["maxOperations"] as? Int ?? 1000, countValueTraversal: c["countValueTraversal"] as? Bool ?? false))
                #expect(c["error"] == nil, "Unexpected success: \(c["id"] ?? "")")
                #expect(result == .bool(c["result"] as? Bool ?? false))
            } catch let error as ExpressionError {
                #expect(error.phase.rawValue == (c["error"] as? String ?? "missing"), "\(c["id"] ?? ""): \(error)")
            }
        }
    }
}
