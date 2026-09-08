const fs = require('fs');

let rawContent = "```json\n{\n  \"roast\": \"Test roast\"\n}\n```".trim();
if (rawContent.startsWith("```json")) {
  rawContent = rawContent.replace(/^```json/, "").replace(/```$/, "").trim();
} else if (rawContent.startsWith("```")) {
  rawContent = rawContent.replace(/^```/, "").replace(/```$/, "").trim();
}

console.log(JSON.parse(rawContent));
