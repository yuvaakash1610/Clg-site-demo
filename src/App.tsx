import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  BookOpen, 
  GraduationCap, 
  Trash2, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronRight,
  Code,
  ListChecks,
  FileText,
  User,
  Settings,
  LogOut,
  Mail,
  Lock,
  UserPlus
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Question, QuestionType, MCQQuestion, ShortAnswerQuestion, PythonQuestion } from "./types";
import { gradeSubmission, GradingResponse, generateTestCases } from "./services/geminiService";
import ReactMarkdown from "react-markdown";
import { auth, db } from "./firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  deleteDoc,
  where,
  Timestamp
} from "firebase/firestore";

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-600 mb-6">The application encountered an unexpected error. Please try refreshing the page.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"landing" | "teacher" | "student">("landing");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [showAuth, setShowAuth] = useState<"login" | "register" | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
        setView("landing");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Questions Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const qs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(qs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "questions"));
    return () => unsubscribe();
  }, [user]);

  // Submissions Listener
  useEffect(() => {
    if (!user || !userData) return;
    const subRef = collection(db, "submissions");
    let q;
    if (userData.role === "teacher") {
      q = query(subRef, orderBy("timestamp", "desc"));
    } else {
      q = query(subRef, where("student_id", "==", user.uid));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissions(subs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "submissions"));
    return () => unsubscribe();
  }, [user, userData]);

  const saveQuestions = async (newQuestions: Question[]) => {
    // Handled by individual add/delete functions now
  };

  const addQuestion = async (q: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "questions"), {
        ...q,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "questions");
    }
  };

  const deleteQuestion = async (id: string) => {
    console.log("Attempting to delete question:", id);
    try {
      await deleteDoc(doc(db, "questions", id));
      console.log("Successfully deleted question:", id);
    } catch (error) {
      console.error("Error deleting question:", error);
      handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
    }
  };

  const saveSubmission = async (submission: any) => {
    if (!user || !userData) return;
    try {
      await addDoc(collection(db, "submissions"), {
        ...submission,
        student_id: user.uid,
        student_name: userData.name,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "submissions");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setView("landing")}
        >
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
            <GraduationCap size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">Panimalar <span className="text-indigo-600">Engineering College</span></span>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {userData?.role === "teacher" && (
                <button 
                  onClick={() => setView("teacher")}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                    view === "teacher" ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Settings size={18} />
                  teacher portal
                </button>
              )}
              {userData?.role === "student" && (
                <button 
                  onClick={() => setView("student")}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                    view === "student" ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <User size={18} />
                  student portal
                </button>
              )}
              <div className="h-8 w-[1px] bg-slate-200 mx-2" />
              <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-100 rounded-xl">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">
                  {userData?.name?.[0] || "?"}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-none">{userData?.name}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{userData?.role}</p>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={() => setShowAuth("login")}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
              >
                Login
              </button>
              <button 
                onClick={() => setShowAuth("register")}
                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-20"
            >
              <h1 className="text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">
                Learning Management <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-8">System</span>
              </h1>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
                Welcome to learning
              </p>
              {!user && (
                <div className="flex items-center justify-center gap-6">
                  <button 
                    onClick={() => setShowAuth("register")}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center gap-3"
                  >
                    Get Started Now
                    <ChevronRight size={24} />
                  </button>
                </div>
              )}
              {user && userData?.role === "teacher" && (
                <button 
                  onClick={() => setView("teacher")}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
                >
                  Go to teacher portal
                </button>
              )}
              {user && userData?.role === "student" && (
                <button 
                  onClick={() => setView("student")}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
                >
                  Go to student portal
                </button>
              )}
            </motion.div>
          )}

          {view === "teacher" && user && userData?.role === "teacher" && (
            <TeacherPortal 
              questions={questions} 
              submissions={submissions}
              onAdd={addQuestion}
              onDelete={deleteQuestion}
            />
          )}

          {view === "student" && user && userData?.role === "student" && (
            <StudentPortal 
              questions={questions} 
              studentName={userData.name}
              onSubmission={saveSubmission}
              submissions={submissions.filter(s => s.student_id === user.uid)}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showAuth && (
          <AuthModal 
            type={showAuth} 
            onClose={() => setShowAuth(null)} 
            onSwitch={() => setShowAuth(showAuth === "login" ? "register" : "login")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Auth Components ---

function AuthModal({ type, onClose, onSwitch }: { type: "login" | "register", onClose: () => void, onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (type === "register") {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", res.user.uid), {
          uid: res.user.uid,
          email,
          name,
          role,
          createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
              {type === "register" ? <UserPlus size={32} /> : <Lock size={32} />}
            </div>
            <h2 className="text-3xl font-bold text-slate-900">{type === "register" ? "Create Account" : "Welcome Back"}</h2>
            <p className="text-slate-500 mt-2">
              {type === "register" ? "Join Panimalar Engineering College" : "Sign in to continue your journey"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {type === "register" && (
              <>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    required
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                      role === "student" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                      role === "teacher" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Teacher
                  </button>
                </div>
              </>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                required
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                required
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-3">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <button 
              disabled={loading}
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                type === "register" ? "Create Account" : "Sign In"
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={onSwitch}
              className="text-slate-500 font-medium hover:text-indigo-600 transition-colors"
            >
              {type === "register" ? "Already have an account? Login" : "Don't have an account? Register"}
            </button>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
        >
          <XCircle size={24} />
        </button>
      </motion.div>
    </div>
  );
}

// --- Teacher Portal Components ---

function TeacherPortal({ questions, submissions, onAdd, onDelete }: { questions: Question[], submissions: any[], onAdd: (q: any) => void, onDelete: (id: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<QuestionType>("mcq");
  const [tab, setTab] = useState<"questions" | "gradebook">("questions");
  const [gradebookMode, setGradebookMode] = useState<"summary" | "detailed">("summary");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const studentSummary = submissions.reduce((acc: any, sub) => {
    const studentId = sub.student_id;
    if (!acc[studentId]) {
      acc[studentId] = {
        id: studentId,
        name: sub.student_name,
        totalMarks: 0,
        possibleMarks: 0,
        submissions: []
      };
    }
    const q = questions.find(q => q.id === sub.question_id);
    const qMarks = q ? (q.type === "python_program" ? q.total_marks : q.marks) : 0;
    
    acc[studentId].totalMarks += sub.marks_awarded || 0;
    acc[studentId].possibleMarks += sub.total_marks || qMarks;
    acc[studentId].submissions.push(sub);
    return acc;
  }, {});

  const summaryList = Object.values(studentSummary);

  return (
    <motion.div
      key="teacher"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Learning Management System</h2>
          <p className="text-slate-500">Welcome to learning</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setTab("questions")}
            className={cn(
              "px-4 py-2 rounded-xl font-bold transition-all",
              tab === "questions" ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Questions
          </button>
          <button 
            onClick={() => setTab("gradebook")}
            className={cn(
              "px-4 py-2 rounded-xl font-bold transition-all",
              tab === "gradebook" ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Gradebook
          </button>
        </div>
      </div>

      {tab === "questions" ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={() => setIsAdding(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
            >
              <Plus size={20} />
              Add Question
            </button>
          </div>

          <div className="grid gap-4">
            {questions.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <FileText className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-500 font-medium">No questions created yet.</p>
              </div>
            ) : (
              questions.map((q) => (
                <div key={q.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      q.type === "mcq" ? "bg-blue-50 text-blue-600" : 
                      q.type === "short_answer" ? "bg-amber-50 text-amber-600" : 
                      "bg-emerald-50 text-emerald-600"
                    )}>
                      {q.type === "mcq" ? <ListChecks size={24} /> : 
                       q.type === "short_answer" ? <FileText size={24} /> : 
                       <Code size={24} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{(q.type || "").replace("_", " ")}</span>
                        <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          {q.type === "python_program" ? q.total_marks : q.marks} Marks
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg text-slate-800">{q.question}</h3>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(q.id);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all relative z-10 cursor-pointer"
                    title="Delete Question"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setGradebookMode("summary")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                gradebookMode === "summary" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Summary
            </button>
            <button
              onClick={() => setGradebookMode("detailed")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                gradebookMode === "detailed" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              All Submissions
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {gradebookMode === "summary" ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Total Score</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Questions Attempted</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summaryList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic">
                          No submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      summaryList.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => setSelectedStudent(s.id)}
                              className="font-bold text-indigo-600 hover:underline"
                            >
                              {s.name}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-900">{s.totalMarks}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-slate-500">{s.possibleMarks}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {s.submissions.length} / {questions.length}
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => setSelectedStudent(s.id)}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Question</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Marks</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                          No submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      submissions.map((s, i) => {
                        const q = questions.find(q => q.id === s.question_id);
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-bold text-indigo-600">{s.student_name}</td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate">{q?.question || s.question_title || "Deleted Question"}</td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold uppercase px-2 py-1 bg-slate-100 text-slate-500 rounded-md">
                                {(s.question_type || "").replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-slate-900">{s.marks_awarded}</span>
                                <span className="text-slate-300">/</span>
                                <span className="text-slate-500">{s.total_marks || (q ? (q.type === "python_program" ? q.total_marks : q.marks) : 0)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(s.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{studentSummary[selectedStudent].name}</h3>
                  <p className="text-sm text-slate-500">Detailed Performance Breakdown</p>
                </div>
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="space-y-4">
                  {studentSummary[selectedStudent].submissions.map((s: any, i: number) => {
                    const q = questions.find(q => q.id === s.question_id);
                    return (
                      <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {(s.question_type || "").replace("_", " ")}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-indigo-600">{s.marks_awarded}</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-slate-500">{s.total_marks || (q ? (q.type === "python_program" ? q.total_marks : q.marks) : 0)}</span>
                          </div>
                        </div>
                        <p className="font-semibold text-slate-800 mb-3">{q?.question || s.question_title || "Deleted Question"}</p>
                        <div className="p-3 bg-white rounded-xl border border-slate-100 text-sm text-slate-600 italic">
                          <p className="font-bold text-[10px] uppercase text-slate-400 mb-1">AI Feedback</p>
                          {s.feedback}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">New Question</h3>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(["mcq", "short_answer", "python_program"] as QuestionType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-bold transition-all capitalize",
                        type === t ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <QuestionForm 
                  type={type} 
                  onCancel={() => setIsAdding(false)} 
                  onSave={(q) => {
                    onAdd(q);
                    setIsAdding(false);
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function QuestionForm({ type, onCancel, onSave }: { type: QuestionType, onCancel: () => void, onSave: (q: Question) => void }) {
  const [generating, setGenerating] = useState(false);
  const [formData, setFormData] = useState<any>({
    question: "",
    marks: type === "mcq" ? 1 : type === "short_answer" ? 2 : 5,
    options: ["", "", "", ""],
    correct_option: "A",
    model_answer: "",
    key_points: "",
    sample_input: "",
    expected_output: "",
    showMultipleSamples: false,
    samples: [{ input: "", expected: "" }],
    rubric: {
      correct_logic: 3,
      handles_base_case: 1,
      syntax_valid: 1
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Math.random().toString(36).substr(2, 9);
    
    let finalQuestion: Question;
    if (type === "mcq") {
      finalQuestion = {
        id,
        type: "mcq",
        question: formData.question,
        options: formData.options,
        correct_option: formData.correct_option,
        marks: Number(formData.marks)
      };
    } else if (type === "short_answer") {
      finalQuestion = {
        id,
        type: "short_answer",
        question: formData.question,
        model_answer: formData.model_answer,
        key_points: formData.key_points.split(",").map((s: string) => s.trim()),
        marks: Number(formData.marks)
      };
    } else {
      setGenerating(true);
      const aiTestCases = await generateTestCases(formData.question);
      setGenerating(false);

      const samples = formData.showMultipleSamples 
        ? formData.samples.filter((s: any) => s.input || s.expected)
        : [{ input: formData.sample_input, expected: formData.expected_output }];

      finalQuestion = {
        id,
        type: "python_program",
        question: formData.question,
        sample_input: samples[0]?.input || "",
        expected_output: samples[0]?.expected || "",
        samples: samples,
        test_cases: aiTestCases.length > 0 
          ? [...samples, ...aiTestCases.filter(ai => !samples.some(s => s.input === ai.input))]
          : samples,
        rubric: formData.rubric,
        total_marks: Number(formData.marks)
      };
    }
    onSave(finalQuestion);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-1">Question Text</label>
        <textarea 
          required
          value={formData.question}
          onChange={e => setFormData({...formData, question: e.target.value})}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all min-h-[100px]"
          placeholder="Enter the question..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">Marks</label>
          <input 
            type="number"
            required
            value={formData.marks}
            onChange={e => setFormData({...formData, marks: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      {type === "mcq" && (
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">Options</label>
          {formData.options.map((opt: string, i: number) => (
            <div key={i} className="flex gap-2">
              <span className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-lg font-bold text-slate-500">
                {String.fromCharCode(65 + i)}
              </span>
              <input 
                required
                value={opt}
                onChange={e => {
                  const newOpts = [...formData.options];
                  newOpts[i] = e.target.value;
                  setFormData({...formData, options: newOpts});
                }}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Correct Option</label>
            <select 
              value={formData.correct_option}
              onChange={e => setFormData({...formData, correct_option: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {["A", "B", "C", "D"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {type === "short_answer" && (
        <>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Model Answer</label>
            <textarea 
              required
              value={formData.model_answer}
              onChange={e => setFormData({...formData, model_answer: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
              placeholder="What is the ideal answer?"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Key Points (comma separated)</label>
            <input 
              required
              value={formData.key_points}
              onChange={e => setFormData({...formData, key_points: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="mutable, syntax, speed"
            />
          </div>
        </>
      )}

      {type === "python_program" && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <input 
              type="checkbox"
              id="multipleSamples"
              checked={formData.showMultipleSamples}
              onChange={e => setFormData({...formData, showMultipleSamples: e.target.checked})}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="multipleSamples" className="text-sm font-bold text-slate-700 cursor-pointer">
              Add multiple sample inputs and outputs?
            </label>
          </div>

          {!formData.showMultipleSamples ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Sample Input</label>
                <textarea 
                  required
                  value={formData.sample_input}
                  onChange={e => setFormData({...formData, sample_input: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-none"
                  placeholder="e.g. 5"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Expected Output</label>
                <textarea 
                  required
                  value={formData.expected_output}
                  onChange={e => setFormData({...formData, expected_output: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-none"
                  placeholder="e.g. 120"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-slate-700">Sample Test Cases</h4>
                <button 
                  type="button"
                  onClick={() => setFormData({
                    ...formData, 
                    samples: [...formData.samples, { input: "", expected: "" }]
                  })}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Sample
                </button>
              </div>
              {formData.samples.map((s: any, i: number) => (
                <div key={i} className="grid grid-cols-2 gap-3 items-start">
                  <div className="relative">
                    <textarea 
                      required
                      value={s.input}
                      onChange={e => {
                        const newSamples = [...formData.samples];
                        newSamples[i].input = e.target.value;
                        setFormData({...formData, samples: newSamples});
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[60px] resize-none"
                      placeholder="Input"
                    />
                    {formData.samples.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => {
                          const newSamples = formData.samples.filter((_: any, idx: number) => idx !== i);
                          setFormData({...formData, samples: newSamples});
                        }}
                        className="absolute -left-6 top-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <textarea 
                    required
                    value={s.expected}
                    onChange={e => {
                      const newSamples = [...formData.samples];
                      newSamples[i].expected = e.target.value;
                      setFormData({...formData, samples: newSamples});
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[60px] resize-none"
                    placeholder="Expected Output"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <h4 className="text-sm font-bold text-slate-700 mb-3">Rubric Breakdown</h4>
            <div className="space-y-2">
              {Object.entries(formData.rubric).map(([key, val]: [string, any]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 capitalize">{key.replace("_", " ")}</span>
                  <input 
                    type="number"
                    value={val}
                    onChange={e => setFormData({
                      ...formData, 
                      rubric: { ...formData.rubric, [key]: Number(e.target.value) }
                    })}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-center text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-3 pt-4">
        <button 
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
        <button 
          type="submit"
          disabled={generating}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating Test Cases...
            </>
          ) : (
            "Save Question"
          )}
        </button>
      </div>
    </form>
  );
}

// --- Student Portal Components ---

function StudentPortal({ questions, studentName, onSubmission, submissions }: { questions: Question[], studentName: string, onSubmission: (s: any) => void, submissions: any[] }) {
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [result, setResult] = useState<GradingResponse | null>(null);

  const existingSubmission = selectedQuestion ? submissions.find(s => s.question_id === selectedQuestion.id) : null;

  useEffect(() => {
    if (existingSubmission) {
      setResult(existingSubmission);
      setAnswer(existingSubmission.answer || "");
    } else {
      setResult(null);
      setAnswer("");
    }
  }, [selectedQuestion, existingSubmission]);

  const handleGrade = async () => {
    if (!selectedQuestion || existingSubmission) return;
    setGrading(true);
    setResult(null);
    setTestResults(null);
    try {
      const res = await gradeSubmission({
        question: selectedQuestion,
        student_answer: answer,
        student_id: auth.currentUser?.uid || "anon",
        question_id: selectedQuestion.id
      });
      setResult(res);
      onSubmission({
        ...res,
        question_id: selectedQuestion.id,
        question_title: selectedQuestion.question,
        total_marks: selectedQuestion.type === "python_program" ? selectedQuestion.total_marks : selectedQuestion.marks,
        timestamp: new Date().toISOString(),
        answer
      });
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("RATE_LIMIT_EXCEEDED")) {
        alert("The AI grading service is currently busy. Please wait a minute and try again.");
      } else {
        alert("Grading failed. Please check your connection or try again later.");
      }
    } finally {
      setGrading(false);
    }
  };

  const runPythonTests = async () => {
    if (!selectedQuestion || selectedQuestion.type !== "python_program" || !answer) return;
    setRunningTests(true);
    setTestResults(null);
    
    try {
      // @ts-ignore
      const pyodide = await window.loadPyodide();
      const results = [];
      
      for (const tc of selectedQuestion.test_cases) {
        try {
          // Set input as a global variable in Python to avoid string literal issues
          pyodide.globals.set("test_input", tc.input);
          
          // Reset stdin/stdout for each test case
          pyodide.runPython(`
import sys
import io
sys.stdin = io.StringIO(test_input)
sys.stdout = io.StringIO()
          `);
          
          await pyodide.runPythonAsync(answer);
          
          const output = pyodide.runPython("sys.stdout.getvalue()").trim();
          const passed = output === tc.expected.trim();
          
          results.push({
            input: tc.input,
            expected: tc.expected,
            actual: output,
            passed
          });
        } catch (err: any) {
          results.push({
            input: tc.input,
            expected: tc.expected,
            actual: err.message,
            passed: false,
            error: true
          });
        }
      }
      setTestResults(results);
    } catch (err) {
      console.error("Pyodide error:", err);
      alert("Failed to initialize Python compiler. Please try again.");
    } finally {
      setRunningTests(false);
    }
  };

  return (
    <motion.div
      key="student"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-8"
    >
      {/* Sidebar: Question List */}
      <div className="md:col-span-1 space-y-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <BookOpen size={20} />
            </div>
            <h3 className="font-bold text-lg">Assignments</h3>
          </div>
          <div className="space-y-2">
            {questions.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  setSelectedQuestion(q);
                  setAnswer("");
                  setResult(null);
                }}
                className={cn(
                  "w-full text-left p-4 rounded-2xl border transition-all group",
                  selectedQuestion?.id === q.id 
                    ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                    : "border-transparent hover:bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{q.type.replace("_", " ")}</span>
                    {submissions.some(s => s.question_id === q.id) && (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    )}
                  </div>
                  <ChevronRight size={14} className={cn(
                    "transition-transform",
                    selectedQuestion?.id === q.id ? "translate-x-1 text-indigo-500" : "text-slate-300 group-hover:translate-x-1"
                  )} />
                </div>
                <p className={cn(
                  "font-semibold text-sm line-clamp-1",
                  selectedQuestion?.id === q.id ? "text-indigo-900" : "text-slate-700"
                )}>{q.question}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-3xl text-white shadow-xl shadow-indigo-100">
          <div className="flex items-center gap-3 mb-4">
            <User size={20} />
            <span className="font-bold">Student Profile</span>
          </div>
          <div className="space-y-1">
            <p className="text-indigo-100 text-sm">Name: {studentName}</p>
            <p className="text-lg font-bold">Python Fundamentals</p>
          </div>
        </div>
      </div>

      {/* Main Content: Question View & Grading */}
      <div className="md:col-span-2 space-y-6">
        {selectedQuestion ? (
          <div className="space-y-6">
            <motion.div 
              key={selectedQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full uppercase tracking-wider">
                  {selectedQuestion.type.replace("_", " ")}
                </span>
                <span className="text-slate-400 text-xs font-medium">• {selectedQuestion.type === "python_program" ? selectedQuestion.total_marks : selectedQuestion.marks} Marks</span>
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-8 leading-tight">
                {selectedQuestion.question}
              </h2>

              {selectedQuestion.type === "mcq" && (
                <div className="grid gap-3">
                  {selectedQuestion.options.map((opt, i) => {
                    const label = String.fromCharCode(65 + i);
                    return (
                      <button
                        key={i}
                        disabled={!!existingSubmission}
                        onClick={() => setAnswer(label)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                          answer === label 
                            ? "bg-indigo-50 border-indigo-600 text-indigo-900" 
                            : "border-slate-100 hover:border-slate-200 text-slate-700",
                          existingSubmission && "cursor-default"
                        )}
                      >
                        <span className={cn(
                          "w-10 h-10 flex items-center justify-center rounded-xl font-bold transition-all",
                          answer === label ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          {label}
                        </span>
                        <span className="font-medium">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedQuestion.type === "short_answer" && (
                <textarea
                  readOnly={!!existingSubmission}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-full min-h-[200px] p-6 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none transition-all text-lg leading-relaxed"
                  placeholder="Type your answer here..."
                />
              )}

              {selectedQuestion.type === "python_program" && (
                <div className="space-y-4">
                  <div className="bg-slate-900 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">solution.py</span>
                    </div>
                    <textarea
                      readOnly={!!existingSubmission}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="w-full min-h-[300px] p-6 bg-transparent text-slate-100 font-mono text-sm outline-none resize-none leading-relaxed"
                      placeholder="# Write your Python code here..."
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    {selectedQuestion.samples && selectedQuestion.samples.length > 1 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedQuestion.samples.map((s, i) => (
                          <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-500">
                            <div className="flex items-center gap-1 mb-1">
                              <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                              <span className="whitespace-pre-wrap">Input: {s.input || "None"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span className="whitespace-pre-wrap">Expected: {s.expected}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs font-bold text-slate-400">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="whitespace-pre-wrap">Sample Input: {selectedQuestion.sample_input}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="whitespace-pre-wrap">Expected: {selectedQuestion.expected_output}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {!existingSubmission && (
                    <div className="flex justify-end">
                      <button
                        disabled={runningTests || !answer}
                        onClick={runPythonTests}
                        className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-all flex items-center gap-2"
                      >
                        {runningTests ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Running Tests...
                          </>
                        ) : (
                          <>
                            <Code size={16} />
                            Run & Test Code
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {testResults && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <ListChecks size={16} className="text-indigo-600" />
                        Compiler Test Results
                      </h4>
                      <div className="grid gap-2">
                        {testResults.map((res, i) => (
                          <div key={i} className={cn(
                            "p-3 rounded-xl border text-xs flex flex-col gap-1",
                            res.passed ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                          )}>
                            <div className="flex items-center justify-between font-bold">
                              <span>Test Case {i + 1}</span>
                              <span>{res.passed ? "PASSED" : "FAILED"}</span>
                            </div>
                            {!res.passed && (
                              <div className="mt-1 space-y-1 font-mono bg-white/50 p-2 rounded">
                                <p><span className="opacity-50">Input:</span> {res.input}</p>
                                <p><span className="opacity-50">Expected:</span> {res.expected}</p>
                                <p><span className="opacity-50">Actual:</span> {res.actual}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {testResults.every(r => r.passed) && (
                        <p className="text-xs font-bold text-emerald-600 text-center">
                          All test cases passed! You can now submit your answer.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 pt-8 border-t border-slate-100 flex justify-between items-center">
                {existingSubmission ? (
                  <div className="flex items-center gap-2 text-indigo-600 font-bold">
                    <CheckCircle2 size={20} />
                    <span>Question Attempted</span>
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm italic">
                    You can only attempt this question once.
                  </div>
                )}
                <button
                  disabled={!answer || grading || !!existingSubmission}
                  onClick={handleGrade}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition-all",
                    !answer || grading || !!existingSubmission
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95"
                  )}
                >
                  {grading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      AI Grading...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      {existingSubmission ? "Submitted" : "Submit Answer"}
                    </>
                  )}
                </button>
              </div>
            </motion.div>

            {/* AI Result View */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden"
                >
                  <div className={cn(
                    "p-6 flex items-center justify-between",
                    result.marks_awarded === result.total_marks ? "bg-emerald-50" : 
                    result.marks_awarded > 0 ? "bg-amber-50" : "bg-red-50"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        result.marks_awarded === result.total_marks ? "bg-emerald-500 text-white" : 
                        result.marks_awarded > 0 ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                      )}>
                        {result.marks_awarded === result.total_marks ? <CheckCircle2 size={28} /> : 
                         result.marks_awarded > 0 ? <AlertCircle size={28} /> : <XCircle size={28} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-xl text-slate-900">AI Feedback</h4>
                        <p className="text-sm font-medium text-slate-500">
                          {result.marks_awarded === result.total_marks ? "Perfect Score!" : 
                           result.marks_awarded > 0 ? "Partially Correct" : "Needs Improvement"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-slate-900">
                        {result.marks_awarded}<span className="text-slate-300 mx-1">/</span>{result.total_marks || (selectedQuestion?.type === "python_program" ? selectedQuestion.total_marks : selectedQuestion?.marks) || 0}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Marks Awarded</span>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed text-lg">
                      <ReactMarkdown>
                        {result.feedback}
                      </ReactMarkdown>
                    </div>

                    {result.missing_points && result.missing_points.length > 0 && (
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <h5 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <AlertCircle size={16} className="text-amber-500" />
                          Missing Key Points
                        </h5>
                        <ul className="space-y-2">
                          {result.missing_points.map((pt, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.test_case_results && (
                      <div className="space-y-3">
                        <h5 className="text-sm font-bold text-slate-800">Test Case Results</h5>
                        <div className="grid gap-2">
                          {result.test_case_results.map((tc, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                {tc.passed ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                                <span className="text-sm font-mono text-slate-600">Input: {tc.input}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Output</span>
                                <span className="text-sm font-mono text-slate-800">{tc.student_output}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.suggested_correction && (
                      <div className="space-y-3">
                        <h5 className="text-sm font-bold text-slate-800">Suggested Correction</h5>
                        <div className="bg-slate-900 p-6 rounded-2xl font-mono text-sm text-emerald-400 overflow-x-auto whitespace-pre">
                          {result.suggested_correction}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
              <BookOpen size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Select an Assignment</h3>
            <p className="text-slate-500 text-center max-w-xs">
              Choose a question from the sidebar to start your attempt and receive AI feedback.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
