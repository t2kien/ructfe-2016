import SwiftyJSON
import Foundation

public class User : Comparable {
    var name: String
    var passHash: String
    var comments = [Comment]()
    var createDt: Int

    init(_ name: String, _ passHash: String) {
        self.name = name
        self.passHash = passHash
        self.createDt = Int(Date().timeIntervalSince1970)
    }

    convenience init(_ jsonString : String) {
        let dataFromString = jsonString.data(using: .utf8, allowLossyConversion: false)!
        let json = JSON(data: dataFromString)
        self.init(json)
    }

    init(_ json: JSON) {
        name = json["name"].stringValue
        passHash = json["passHash"].stringValue
        comments = json["comments"].arrayValue.map {
            Comment($0)
        }
        createDt = json["createDt"].int!
    }

    public func toJson() -> String {
        return JSONSerializer.toJson(self)
    }

    public func rating() -> Double {
        let positiveBiasMarks = (0..<15).map{_ in 5}
        let marks = comments.filter { $0.mark != 0}.map { $0.mark }
        let allMarks = positiveBiasMarks + marks
        return Double(allMarks.reduce(0,+)) / Double(allMarks.count)
    }

    public static func < (lhs: User, rhs: User) -> Bool {
        if(lhs == rhs){
            return false;
        }

        let lhsRating = round(lhs.rating())
        let rhsRating = round(rhs.rating())
        if lhsRating != rhsRating {
            return lhsRating > rhsRating
        } else if lhs.createDt != rhs.createDt {
            return lhs.createDt > rhs.createDt
        } else {
            return lhs.name < rhs.name
        }
    }

    public static func == (lhs: User, rhs: User) -> Bool {
        return lhs.name == rhs.name
    }
}