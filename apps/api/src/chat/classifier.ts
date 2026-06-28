export interface ClassificationResult {
  intent: "complaint" | "request" | "status_query" | "unknown";
  category?: string;
  type?: string;
}

export interface Classifier {
  classify(text: string): ClassificationResult;
}

const COMPLAINT_KEYWORDS: Array<{ category: string; keywords: RegExp }> = [
  { category: "electric", keywords: /\b(electric|electrical|light|fan|plug|socket|switch|power|wiring|bulb|mcb|fuse)\b/i },
  { category: "plumbing", keywords: /\b(plumb|water|pipe|tap|drain|leak|flood|flush|toilet|washroom|bathroom|sewage)\b/i },
  { category: "mason", keywords: /\b(crack|wall|ceiling|plaster|mason|tile|floor|seep|seepage|damp|concrete)\b/i },
  { category: "painting", keywords: /\b(paint|colour|color|peel|repaint|distemper|weatherproof)\b/i },
];

const REQUEST_KEYWORDS: Array<{ category: string; keywords: RegExp }> = [
  { category: "shifting", keywords: /\b(shift|shifting|move|mover|movers|packers|reloc)\b/i },
  { category: "ac_cleaning", keywords: /\b(ac|air.?condition|cooling|filter.?clean|servic)\b/i },
  { category: "parking_alloc", keywords: /\b(parking|park.?spot|park.?alloc)\b/i },
  { category: "playground_alloc", keywords: /\b(playground|play.?ground|play.?area|amenity|clubhouse|club.?house)\b/i },
];

const STATUS_KEYWORDS = /\b(status|where|track|follow.?up|update|complaint|request|progress|pending|resolved|open|my.?ticket)\b/i;

export class RuleBasedClassifier implements Classifier {
  classify(text: string): ClassificationResult {
    if (STATUS_KEYWORDS.test(text)) {
      return { intent: "status_query" };
    }

    for (const { category, keywords } of COMPLAINT_KEYWORDS) {
      if (keywords.test(text)) {
        return { intent: "complaint", category, type: "complaint" };
      }
    }

    for (const { category, keywords } of REQUEST_KEYWORDS) {
      if (keywords.test(text)) {
        return { intent: "request", category, type: "request" };
      }
    }

    return { intent: "unknown" };
  }
}

export function createClassifier(_classifierType = "fake"): Classifier {
  // "llm" variant reserved for future LLM-backed implementation
  return new RuleBasedClassifier();
}

export const MENU_MESSAGE =
  "I can help you with:\n" +
  "1. Complaints: electrical issues, plumbing, mason work, painting\n" +
  "2. Requests: shifting assistance, AC cleaning, parking allocation, playground slot\n" +
  "3. Check status of your complaints — just say \"status\" or \"where is my complaint\"\n\n" +
  "Please describe your issue in detail and I will raise it for you.";
