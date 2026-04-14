export interface User {
  uid: string;
  email: string;
  name: string;
  role: "teacher" | "student";
  rollNumber?: string;
  year?: "1st Year" | "2nd Year";
  section?: string;
  createdAt: string;
}

export type QuestionType = "mcq" | "short_answer" | "python_program";

export interface MCQQuestion {
  id: string;
  type: "mcq";
  question: string;
  options: string[];
  correct_option: string;
  marks: number;
}

export interface ShortAnswerQuestion {
  id: string;
  type: "short_answer";
  question: string;
  model_answer: string;
  key_points: string[];
  marks: number;
}

export interface PythonQuestion {
  id: string;
  type: "python_program";
  question: string;
  sample_input: string;
  expected_output: string;
  samples?: Array<{ input: string; expected: string }>;
  test_cases: Array<{ input: string; expected: string }>;
  rubric: {
    correct_logic: number;
    handles_base_case: number;
    syntax_valid: number;
  };
  total_marks: number;
}

export type Question = MCQQuestion | ShortAnswerQuestion | PythonQuestion;

export interface Assignment {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  deadline: string;
  targetYear: "1st Year" | "2nd Year";
  targetSections: string[];
  createdBy: string;
  createdAt: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  student_roll_number?: string;
  student_year?: string;
  student_section?: string;
  answers: {
    [question_id: string]: {
      answer: string;
      correct_answer?: string;
      marks_awarded: number;
      feedback: string;
      total_marks: number;
      question_type: QuestionType;
      question_title: string;
    }
  };
  total_marks_awarded: number;
  total_possible_marks: number;
  timestamp: string;
}

export interface GradingRequest {
  question: any;
  student_answer: string;
  student_id: string;
  question_id: string;
}

export interface GradingResponse {
  student_id: string;
  question_id: string;
  question_type: "mcq" | "short_answer" | "python_program";
  marks_awarded: number;
  total_marks: number;
  is_correct?: boolean;
  feedback: string;
  breakdown?: {
    correct_logic?: number;
    handles_base_case?: number;
    syntax_valid?: number;
  };
  missing_points?: string[];
  test_case_results?: Array<{
    input: string;
    expected: string;
    student_output: string;
    passed: boolean;
  }>;
  suggested_correction?: string;
}
