import { GoogleGenAI, Type } from "@google/genai";
import { GradingRequest, GradingResponse } from "../types";

export type { GradingRequest, GradingResponse };

// Initialize Gemini API
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
You are an AI teaching assistant embedded inside a Learning Management System (LMS) for a programming course instructor.
Your role is to evaluate student answers fairly, accurately, and constructively based on the question type and the instructor's defined correct answer or rubric.

=== GRADING RULES BY QUESTION TYPE ===

=== MCQ GRADING ===
- Compare student's selected option to "correct_option".
- Award full marks if correct, 0 if wrong. No partial marks.
- Output: { "marks_awarded": 1 or 0, "is_correct": true/false, "correct_answer": "..." }

=== SHORT ANSWER GRADING (2-mark) ===
- Compare student's written answer against "model_answer" and "key_points".
- Award marks based on how many key points are covered:
  * 2/2 marks: Answer covers all key points with correct understanding.
  * 1/2 marks: Answer partially correct — covers some key points or has minor errors.
  * 0/2 marks: Answer is wrong, irrelevant, or missing key concepts.
- Be lenient with exact wording — evaluate understanding, not memorisation.

=== PYTHON PROGRAM GRADING ===
Evaluate the student's Python code on these criteria:
1. SYNTAX CHECK: Is the code syntactically valid Python? (If not, 0 marks for logic.)
2. LOGIC CHECK: Does the function/program logic correctly solve the problem?
3. TEST CASES: Mentally trace through each test case. Does the code produce the expected output?
4. RUBRIC SCORING: Award marks for each rubric item based on the code quality.
5. EDGE CASES: Does the code handle edge cases mentioned in test_cases?

- Do NOT execute code. Evaluate through static analysis and logical tracing.
- Be constructive — if wrong, explain what the student should fix.

=== FEEDBACK & TONE GUIDELINES ===
TONE: Be encouraging, specific, and educational.
FOR CORRECT ANSWERS: Keep feedback brief and reinforcing.
FOR PARTIALLY CORRECT: Acknowledge what was right, then explain what was missing.
FOR WRONG ANSWERS: Guide the student toward the right understanding without being harsh.

=== OUTPUT CONTRACT ===
Always respond in valid JSON only.
`;

const TEST_CASE_SYSTEM_INSTRUCTION = `
You are an expert Python instructor. Your task is to generate a set of comprehensive test cases for a given Python programming problem.
Each test case should include:
1. input: The string input that would be passed to the program (simulating input() calls).
2. expected: The exact string output expected from the program.

Provide a mix of:
- Simple cases (base functionality)
- Edge cases (empty inputs, zero, large numbers, etc.)
- Hidden cases (complex logic tests)

Return exactly 5-8 test cases in a JSON array format.
`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateTestCases(question: string): Promise<Array<{ input: string; expected: string }>> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate test cases for this Python problem: ${question}`,
      config: {
        systemInstruction: TEST_CASE_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              input: { type: Type.STRING },
              expected: { type: Type.STRING }
            },
            required: ["input", "expected"]
          }
        }
      },
    });

    if (!response.text) {
      throw new Error("No response from AI");
    }

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating test cases:", error);
    return [];
  }
}

export async function gradeSubmission(request: GradingRequest, retries = 3): Promise<GradingResponse> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: JSON.stringify(request),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
        },
      });

      if (!response.text) {
        throw new Error("No response from AI");
      }

      return JSON.parse(response.text);
    } catch (error: any) {
      console.error(`Grading Attempt ${i + 1} failed:`, error);
      
      const isRateLimit = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
      
      if (isRateLimit && i < retries - 1) {
        const waitTime = Math.pow(2, i + 1) * 1000;
        console.log(`Rate limit hit. Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }
      
      if (isRateLimit) {
        throw new Error("RATE_LIMIT_EXCEEDED: The AI grading service is currently at capacity. Please wait a minute and try again.");
      }
      
      if (error.message?.includes("API key not valid") || error.message?.includes("API_KEY_INVALID")) {
        throw new Error("GEMINI_API_KEY_MISSING: The Gemini API Key is invalid or missing. Please set it in the AI Studio Settings/Secrets panel.");
      }
      
      throw error;
    }
  }
  
  throw new Error("Max retries exceeded");
}
