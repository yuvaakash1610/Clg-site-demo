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
  User as UserIcon,
  Settings,
  LogOut,
  Mail,
  Lock,
  UserPlus,
  Linkedin,
  Github
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Question, QuestionType, MCQQuestion, ShortAnswerQuestion, PythonQuestion, Assignment, AssignmentSubmission, User } from "./types";
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
              className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
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

  // Assignments Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "assignments"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const as = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
      setAssignments(as);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "assignments"));
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
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssignmentSubmission));
      setSubmissions(subs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "submissions"));
    return () => unsubscribe();
  }, [user, userData]);

  const addAssignment = async (a: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "assignments"), {
        ...a,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "assignments");
    }
  };

  const deleteAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "assignments", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `assignments/${id}`);
    }
  };

  const saveSubmission = async (submission: any) => {
    if (!user || !userData) return;
    try {
      await addDoc(collection(db, "submissions"), {
        ...submission,
        student_id: user.uid,
        student_name: userData.name,
        student_roll_number: userData.rollNumber || "",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "submissions");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-primary/10 selection:text-primary">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setView("landing")}
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:rotate-6 transition-transform">
            <GraduationCap size={24} />
          </div>
          <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-800">Learning <span className="text-primary">Portal</span></span>
        </motion.div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          {user ? (
            <>
              {userData?.role === "teacher" && (
                <button 
                  onClick={() => setView("teacher")}
                  className={cn(
                    "px-3 sm:px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm sm:text-base",
                    view === "teacher" ? "bg-primary text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Settings size={18} />
                  <span className="hidden xs:inline">teacher portal</span>
                </button>
              )}
              {userData?.role === "student" && (
                <button 
                  onClick={() => setView("student")}
                  className={cn(
                    "px-3 sm:px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm sm:text-base",
                    view === "student" ? "bg-primary text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <UserIcon size={18} />
                  <span className="hidden xs:inline">student portal</span>
                </button>
              )}
              <div className="h-8 w-[1px] bg-slate-200 mx-1 sm:mx-2" />
              <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 bg-slate-100 rounded-xl">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center font-bold text-xs">
                  {userData?.name?.[0] || "?"}
                </div>
                <div className="hidden md:block">
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
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAuth("login")}
              className="px-3 sm:px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all text-sm sm:text-base"
            >
              Login
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAuth("register")}
              className="px-3 sm:px-4 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-sm sm:text-base"
            >
              Register
            </motion.button>
          </div>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-12 sm:py-20"
            >
              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight px-4">
                Learning Management <span className="text-primary underline decoration-primary/20 underline-offset-8">System</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed px-4">
                Welcome to learning
              </p>
              {!user && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                  <motion.button 
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAuth("register")}
                    className="w-full sm:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
                  >
                    Get Started Now
                    <ChevronRight size={24} />
                  </motion.button>
                </div>
              )}
              {user && userData?.role === "teacher" && (
                <motion.button 
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setView("teacher")}
                  className="px-8 py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                >
                  Go to teacher portal
                </motion.button>
              )}
              {user && userData?.role === "student" && (
                <motion.button 
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setView("student")}
                  className="px-8 py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                >
                  Go to student portal
                </motion.button>
              )}
            </motion.div>
          )}

          {view === "teacher" && user && userData?.role === "teacher" && (
            <TeacherPortal 
              assignments={assignments} 
              submissions={submissions}
              onAdd={addAssignment}
              onDelete={deleteAssignment}
            />
          )}

          {view === "student" && user && userData?.role === "student" && (
            <StudentPortal 
              assignments={assignments} 
              studentData={userData}
              onSubmission={saveSubmission}
              submissions={submissions.filter(s => s.student_id === user.uid)}
            />
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <p className="text-slate-400 text-sm font-medium mb-1">Website built by</p>
            <h4 className="text-xl font-bold text-slate-800">Yuvaakash K</h4>
            <p className="text-slate-500 text-sm">(2025-2029) Batch Computer Science Student</p>
            <p className="text-slate-500 text-sm">Panimalar Engineering College</p>
          </div>
          <div className="flex items-center gap-4">
            <motion.a 
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.9 }}
              href="https://www.linkedin.com/in/yuvaakash-kannan-450751360" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-600 hover:text-primary hover:border-primary/20 hover:shadow-lg hover:shadow-primary/10 transition-all"
            >
              <Linkedin size={24} />
            </motion.a>
            <motion.a 
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.9 }}
              href="https://github.com/yuvaakash1610" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-lg transition-all"
            >
              <Github size={24} />
            </motion.a>
          </div>
        </div>
      </footer>

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
  const [rollNumber, setRollNumber] = useState("");
  const [year, setYear] = useState<"1st Year" | "2nd Year">("1st Year");
  const [section, setSection] = useState("");
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
          rollNumber: role === "student" ? rollNumber : "",
          year: role === "student" ? year : null,
          section: role === "student" ? section : "",
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
            <div className="w-16 h-16 bg-primary text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
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
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    required
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
                  />
                </div>
                {role === "student" && (
                  <>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input 
                        required
                        type="text"
                        placeholder="Roll Number"
                        value={rollNumber}
                        onChange={e => setRollNumber(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <select
                          required
                          value={year}
                          onChange={e => setYear(e.target.value as any)}
                          className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-slate-700 font-medium appearance-none"
                        >
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                        </select>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
                      </div>
                      <div className="relative">
                        <input 
                          required
                          type="text"
                          placeholder="Section (e.g. A)"
                          value={section}
                          onChange={e => setSection(e.target.value.toUpperCase())}
                          className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
                        />
                      </div>
                    </div>
                  </>
                )}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                      role === "student" ? "bg-white text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                      role === "teacher" ? "bg-white text-primary shadow-sm" : "text-slate-500"
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
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
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
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
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
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                type === "register" ? "Create Account" : "Sign In"
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSwitch}
              className="text-slate-500 font-medium hover:text-primary transition-colors"
            >
              {type === "register" ? "Already have an account? Login" : "Don't have an account? Register"}
            </motion.button>
          </div>
        </div>
        <motion.button 
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
        >
          <XCircle size={24} />
        </motion.button>
      </motion.div>
    </div>
  );
}

// --- Teacher Portal Components ---

function TeacherPortal({ assignments, submissions = [], onAdd, onDelete }: { assignments: Assignment[], submissions: AssignmentSubmission[], onAdd: (a: any) => void, onDelete: (id: string) => void }) {
  const [tab, setTab] = useState<"assignments" | "gradebook">("assignments");
  const [isAdding, setIsAdding] = useState(false);
  const [gradebookMode, setGradebookMode] = useState<"summary" | "detailed">("summary");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<"All" | "1st Year" | "2nd Year">("All");
  const [sectionFilter, setSectionFilter] = useState<string>("All");

  const SECTIONS = "ABCDEFGHIJKLMNOP".split("");

  const studentSummary = (submissions || []).reduce((acc: any, sub) => {
    const studentId = sub.student_id;
    if (!acc[studentId]) {
      acc[studentId] = {
        id: studentId,
        name: sub.student_name,
        rollNumber: sub.student_roll_number || "N/A",
        year: sub.student_year || "N/A",
        section: sub.student_section || "N/A",
        totalMarks: 0,
        possibleMarks: 0,
        submissions: []
      };
    }
    
    acc[studentId].totalMarks += sub.total_marks_awarded || 0;
    acc[studentId].possibleMarks += sub.total_possible_marks || 0;
    acc[studentId].submissions.push(sub);
    return acc;
  }, {});

  const summaryList = Object.values(studentSummary)
    .filter((s: any) => (yearFilter === "All" || s.year === yearFilter) && (sectionFilter === "All" || s.section === sectionFilter))
    .sort((a: any, b: any) => {
      const rollA = a.rollNumber || "";
      const rollB = b.rollNumber || "";
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

  const filteredDetailedSubmissions = (submissions || []).filter(s => {
    const matchesYear = yearFilter === "All" || s.student_year === yearFilter;
    const matchesSection = sectionFilter === "All" || s.student_section === sectionFilter;
    return matchesYear && matchesSection;
  });

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
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTab("assignments")}
            className={cn(
              "px-4 py-2 rounded-xl font-bold transition-all",
              tab === "assignments" ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Assignments
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTab("gradebook")}
            className={cn(
              "px-4 py-2 rounded-xl font-bold transition-all",
              tab === "gradebook" ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Gradebook
          </motion.button>
        </div>
      </div>

      {tab === "assignments" ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <motion.button 
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAdding(true)}
              className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus size={20} />
              Create Assignment
            </motion.button>
          </div>

          <div className="grid gap-4">
            {assignments.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <FileText className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-500 font-medium">No assignments created yet.</p>
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group flex items-start justify-between">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
                      <FileText size={24} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Assignment</span>
                        <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          {a.questions.length} Questions
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                          {a.targetYear}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                          Sections: {a.targetSections?.join(", ") || "All"}
                        </span>
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          new Date(a.deadline) < new Date() ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                        )}>
                          Deadline: {new Date(a.deadline).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg text-slate-800">{a.title}</h3>
                      <p className="text-sm text-slate-500">{a.description}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(a.id);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all relative z-10 cursor-pointer"
                    title="Delete Assignment"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              <button
                onClick={() => setGradebookMode("summary")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  gradebookMode === "summary" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Summary
              </button>
              <button
                onClick={() => setGradebookMode("detailed")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  gradebookMode === "detailed" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                All Submissions
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-500">Filter Year:</span>
                <div className="relative">
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value as any)}
                    className="pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary appearance-none transition-all"
                  >
                    <option value="All">All Years</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={14} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-500">Filter Section:</span>
                <div className="relative">
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary appearance-none transition-all"
                  >
                    <option value="All">All Sections</option>
                    {SECTIONS.map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={14} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {gradebookMode === "summary" ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Roll No</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Year</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Section</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Total Score</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Assignments Done</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summaryList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                          No submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      summaryList.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs font-bold text-slate-500">{s.rollNumber}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => setSelectedStudent(s.id)}
                              className="font-bold text-primary hover:underline"
                            >
                              {s.name}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{s.year}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-bold">{s.section}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-900">{s.totalMarks}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-slate-500">{s.possibleMarks}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {s.submissions.length} / {assignments.length}
                          </td>
                          <td className="px-6 py-4">
                            <motion.button 
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedStudent(s.id)}
                              className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
                            >
                              View Details
                            </motion.button>
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
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Roll No</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Year</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Section</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Assignment</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Score</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDetailedSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                          No submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      filteredDetailedSubmissions.map((s, i) => {
                        const a = assignments.find(a => a.id === s.assignment_id);
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs font-bold text-slate-500">{s.student_roll_number || "N/A"}</span>
                            </td>
                            <td className="px-6 py-4 font-bold text-primary">{s.student_name}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{s.student_year}</td>
                            <td className="px-6 py-4 text-sm text-slate-600 font-bold">{s.student_section}</td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate">{a?.title || "Deleted Assignment"}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-slate-900">{s.total_marks_awarded}</span>
                                <span className="text-slate-300">/</span>
                                <span className="text-slate-500">{s.total_possible_marks}</span>
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
        {selectedStudent && studentSummary[selectedStudent] && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{studentSummary[selectedStudent]?.name || "Unknown Student"}</h3>
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
                <div className="space-y-6">
                  {studentSummary[selectedStudent]?.submissions.map((s: AssignmentSubmission, i: number) => {
                    const a = assignments.find(a => a.id === s.assignment_id);
                    return (
                      <div key={i} className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                          <h4 className="font-bold text-lg text-slate-800">{a?.title || "Deleted Assignment"}</h4>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-slate-500">Score:</span>
                            <span className="font-bold text-primary">{s.total_marks_awarded}</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-slate-500">{s.total_possible_marks}</span>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {s.answers && Object.entries(s.answers).map(([qid, ans]: [string, any]) => (
                            <div key={qid} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                  {ans.question_type?.replace("_", " ") || "QUESTION"}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-primary">{ans.marks_awarded}</span>
                                  <span className="text-slate-300">/</span>
                                  <span className="text-slate-500">{ans.total_marks}</span>
                                </div>
                              </div>
                              <p className="font-semibold text-slate-800 mb-2">{ans.question_title}</p>
                              <div className="space-y-2 mb-3">
                                <div className="p-2 bg-white rounded-lg border border-slate-100 text-xs">
                                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Student's Answer</p>
                                  <p className="text-slate-700 font-medium">{ans.answer || <span className="italic text-slate-400">No answer provided</span>}</p>
                                </div>
                                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
                                  <p className="text-[10px] font-bold uppercase text-emerald-400 mb-1">Correct Answer</p>
                                  <p className="text-emerald-700 font-medium">{ans.correct_answer || "N/A"}</p>
                                </div>
                              </div>
                              <div className="p-3 bg-white rounded-xl border border-slate-100 text-sm text-slate-600 italic">
                                <p className="font-bold text-[10px] uppercase text-slate-400 mb-1">AI Feedback</p>
                                {ans.feedback}
                              </div>
                            </div>
                          ))}
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
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">Create New Assignment</h3>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <AssignmentCreator 
                  onCancel={() => setIsAdding(false)} 
                  onSave={(a) => {
                    onAdd(a);
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

function AssignmentCreator({ onSave, onCancel }: { onSave: (a: any) => void, onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [targetYear, setTargetYear] = useState<"1st Year" | "2nd Year">("1st Year");
  const [targetSections, setTargetSections] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [currentType, setCurrentType] = useState<QuestionType>("mcq");

  const SECTIONS = "ABCDEFGHIJKLMNOP".split("");

  const toggleSection = (s: string) => {
    if (targetSections.includes(s)) {
      setTargetSections(targetSections.filter(x => x !== s));
    } else {
      setTargetSections([...targetSections, s]);
    }
  };

  const handleAddQuestion = (q: Question) => {
    setQuestions([...questions, q]);
    setIsAddingQuestion(false);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (questions.length === 0) {
      alert("Please add at least one question to the assignment.");
      return;
    }
    if (targetSections.length === 0) {
      alert("Please select at least one target section.");
      return;
    }
    onSave({
      title,
      description,
      deadline,
      targetYear,
      targetSections,
      questions
    });
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Assignment Title</label>
              <input 
                required
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="e.g. Python Basics Quiz"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
              <textarea 
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none transition-all min-h-[100px]"
                placeholder="Describe the assignment..."
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Deadline</label>
              <input 
                required
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Target Year</label>
              <div className="relative">
                <select
                  required
                  value={targetYear}
                  onChange={e => setTargetYear(e.target.value as any)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none bg-white font-medium text-slate-700"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Target Sections</label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {SECTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSection(s)}
                    className={cn(
                      "h-10 rounded-lg font-bold text-sm transition-all border",
                      targetSections.includes(s)
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:border-primary/30"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Select one or more sections (A to P)</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800">Questions ({questions.length})</h4>
              <button 
                type="button"
                onClick={() => setIsAddingQuestion(true)}
                className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all flex items-center gap-1"
              >
                <Plus size={14} /> Add Question
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {questions.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 text-sm">No questions added yet.</p>
                </div>
              ) : (
                questions.map((q, i) => (
                  <div key={q.id} className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full text-[10px] font-bold text-slate-500">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800 line-clamp-1">{q.question}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{q.type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-6 border-t border-slate-100">
          <button 
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            Save Assignment
          </button>
        </div>
      </form>

      <AnimatePresence>
        {isAddingQuestion && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xl font-bold">New Question</h3>
                <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                  {(["mcq", "short_answer", "python_program"] as QuestionType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCurrentType(t)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-bold transition-all capitalize",
                        currentType === t ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <QuestionForm 
                  type={currentType} 
                  onCancel={() => setIsAddingQuestion(false)} 
                  onSave={handleAddQuestion}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
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
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all min-h-[100px]"
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
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
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
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none"
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Correct Option</label>
            <select 
              value={formData.correct_option}
              onChange={e => setFormData({...formData, correct_option: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none"
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
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none min-h-[100px]"
              placeholder="What is the ideal answer?"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Key Points (comma separated)</label>
            <input 
              required
              value={formData.key_points}
              onChange={e => setFormData({...formData, key_points: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none"
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
              className="w-4 h-4 text-primary rounded focus:ring-primary"
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-none"
                  placeholder="e.g. 5"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Expected Output</label>
                <textarea 
                  required
                  value={formData.expected_output}
                  onChange={e => setFormData({...formData, expected_output: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-none"
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
                  className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1"
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
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary outline-none min-h-[60px] resize-none"
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
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary outline-none min-h-[60px] resize-none"
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
          className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
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

function StudentPortal({ assignments, studentData, onSubmission, submissions = [] }: { assignments: Assignment[], studentData: User, onSubmission: (s: any) => void, submissions: AssignmentSubmission[] }) {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [gradingResults, setGradingResults] = useState<{[key: string]: GradingResponse}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [grading, setGrading] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);

  const currentQuestion = selectedAssignment?.questions[currentQuestionIndex];
  const existingSubmission = selectedAssignment ? (submissions || []).find(s => s.assignment_id === selectedAssignment.id) : null;

  const isOverdue = selectedAssignment ? new Date(selectedAssignment.deadline) < new Date() : false;

  const handleNext = () => {
    if (selectedAssignment && currentQuestionIndex < selectedAssignment.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setTestResults(null);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setTestResults(null);
    }
  };

  const handleGradeCurrent = async () => {
    if (!currentQuestion || isSubmitting || grading) return;
    setGrading(true);
    try {
      const res = await gradeSubmission({
        question: currentQuestion,
        student_answer: answers[currentQuestion.id] || "",
        student_id: auth.currentUser?.uid || "anon",
        question_id: currentQuestion.id
      });
      setGradingResults({ ...gradingResults, [currentQuestion.id]: res });
    } catch (err: any) {
      console.error(err);
      alert("Grading failed. Please try again.");
    } finally {
      setGrading(false);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || isSubmitting) return;
    
    // Check if all questions are answered
    const unanswered = selectedAssignment.questions.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
      if (!confirm(`You have ${unanswered.length} unanswered questions. Submit anyway?`)) return;
    }

    setIsSubmitting(true);
    setSubmissionStatus(null);
    try {
      const finalAnswers: any = {};
      let totalMarksAwarded = 0;
      let totalPossibleMarks = 0;

      // Grade all questions in parallel to save time
      const gradingPromises = selectedAssignment.questions.map(async (q) => {
        const qPossible = q.type === "python_program" ? q.total_marks : q.marks;
        let res: GradingResponse | null = null;
        const studentAnswer = answers[q.id] || "";
        
        // Local grading for MCQs to ensure reliability
        if (q.type === "mcq") {
          const isCorrect = studentAnswer === q.correct_option;
          res = {
            student_id: auth.currentUser?.uid || "anon",
            question_id: q.id,
            question_type: "mcq",
            marks_awarded: isCorrect ? qPossible : 0,
            total_marks: qPossible,
            is_correct: isCorrect,
            feedback: isCorrect ? "Correct answer!" : `Incorrect. The correct option was ${q.correct_option}.`
          };
          
          // Try to get AI feedback for better explanation, but don't let it override the score
          if (studentAnswer) {
            try {
              const aiRes = await gradeSubmission({
                question: q,
                student_answer: studentAnswer,
                student_id: auth.currentUser?.uid || "anon",
                question_id: q.id
              });
              if (aiRes && aiRes.feedback) {
                res.feedback = aiRes.feedback;
              }
            } catch (err) {
              console.error("AI feedback failed for MCQ, using local feedback");
            }
          }
        } else {
          // AI grading for short answers and python programs
          if (studentAnswer) {
            try {
              res = await gradeSubmission({
                question: q,
                student_answer: studentAnswer,
                student_id: auth.currentUser?.uid || "anon",
                question_id: q.id
              });
            } catch (err) {
              console.error(`Grading failed for question ${q.id}:`, err);
              res = {
                student_id: auth.currentUser?.uid || "anon",
                question_id: q.id,
                question_type: q.type,
                marks_awarded: 0,
                total_marks: qPossible,
                feedback: "AI grading failed for this question. Please contact your teacher."
              };
            }
          }
        }
        
        let correctAnswer = "";
        if (q.type === "mcq") {
          const optIndex = q.correct_option.charCodeAt(0) - 65;
          const optText = q.options[optIndex] || "";
          correctAnswer = `(${q.correct_option}) ${optText}`;
        } else if (q.type === "short_answer") {
          correctAnswer = q.model_answer;
        } else if (q.type === "python_program") {
          correctAnswer = q.expected_output;
        }

        return {
          id: q.id,
          data: {
            answer: studentAnswer,
            correct_answer: correctAnswer,
            marks_awarded: res?.marks_awarded || 0,
            feedback: res?.feedback || "No answer provided.",
            total_marks: qPossible,
            question_type: q.type,
            question_title: q.question
          }
        };
      });

      const results = await Promise.all(gradingPromises);
      
      results.forEach(r => {
        finalAnswers[r.id] = r.data;
        totalMarksAwarded += r.data.marks_awarded;
        totalPossibleMarks += r.data.total_marks;
      });

      await onSubmission({
        assignment_id: selectedAssignment.id,
        answers: finalAnswers,
        total_marks_awarded: totalMarksAwarded,
        total_possible_marks: totalPossibleMarks,
        student_year: studentData.year,
        student_section: studentData.section
      });
      
      setSubmissionStatus({ type: 'success', message: "Assignment submitted and graded successfully!" });
      setTimeout(() => {
        setSelectedAssignment(null);
        setSubmissionStatus(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setSubmissionStatus({ type: 'error', message: "Failed to submit assignment. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const runPythonTests = async () => {
    if (!currentQuestion || currentQuestion.type !== "python_program" || !answers[currentQuestion.id]) return;
    setRunningTests(true);
    setTestResults(null);
    
    try {
      // @ts-ignore
      const pyodide = await window.loadPyodide();
      const results = [];
      
      for (const tc of currentQuestion.test_cases) {
        try {
          pyodide.globals.set("test_input", tc.input);
          pyodide.runPython(`
import sys
import io
sys.stdin = io.StringIO(test_input)
sys.stdout = io.StringIO()
          `);
          await pyodide.runPythonAsync(answers[currentQuestion.id]);
          const output = pyodide.runPython("sys.stdout.getvalue()").trim();
          const passed = output === tc.expected.trim();
          results.push({ input: tc.input, expected: tc.expected, actual: output, passed });
        } catch (err: any) {
          results.push({ input: tc.input, expected: tc.expected, actual: err.message, passed: false, error: true });
        }
      }
      setTestResults(results);
    } catch (err) {
      console.error("Pyodide error:", err);
      alert("Failed to initialize Python compiler.");
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
      <div className="md:col-span-1 space-y-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <BookOpen size={20} />
            </div>
            <h3 className="font-bold text-lg">Assignments</h3>
          </div>
          <div className="space-y-2">
            {assignments.filter(a => {
              const sub = submissions.find(s => s.assignment_id === a.id);
              const overdue = new Date(a.deadline) < new Date();
              const matchesYear = a.targetYear === studentData.year;
              const matchesSection = !a.targetSections || a.targetSections.length === 0 || a.targetSections.includes(studentData.section || "");
              // Show if (not overdue AND matches year AND matches section) OR if already submitted
              return (matchesYear && matchesSection && !overdue) || sub;
            }).map((a) => {
              const sub = submissions.find(s => s.assignment_id === a.id);
              const overdue = new Date(a.deadline) < new Date();
              return (
                <motion.button
                  key={a.id}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedAssignment(a);
                    setCurrentQuestionIndex(0);
                    setAnswers({});
                    setGradingResults({});
                  }}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl border transition-all group",
                    selectedAssignment?.id === a.id 
                      ? "bg-primary/10 border-primary/20 shadow-sm" 
                      : "border-transparent hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {a.questions.length} Questions
                      </span>
                      {sub && <CheckCircle2 size={12} className="text-emerald-500" />}
                      {!sub && overdue && <AlertCircle size={12} className="text-red-500" />}
                    </div>
                    <ChevronRight size={14} className={cn(
                      "transition-transform",
                      selectedAssignment?.id === a.id ? "translate-x-1 text-primary" : "text-slate-300 group-hover:translate-x-1"
                    )} />
                  </div>
                  <p className={cn(
                    "font-semibold text-sm line-clamp-1",
                    selectedAssignment?.id === a.id ? "text-primary" : "text-slate-700"
                  )}>{a.title}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Due: {new Date(a.deadline).toLocaleString()}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary to-primary/80 p-6 rounded-3xl text-white shadow-xl shadow-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <UserIcon size={20} />
            <span className="font-bold">Student Profile</span>
          </div>
          <div className="space-y-1">
            <p className="text-primary-foreground/80 text-sm">Name: {studentData.name}</p>
            <p className="text-primary-foreground/80 text-sm">Year: {studentData.year}</p>
            <p className="text-primary-foreground/80 text-sm">Section: {studentData.section}</p>
            <p className="text-lg font-bold">Learning Portal</p>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 space-y-6">
        {selectedAssignment ? (
          <div className="space-y-6">
            {existingSubmission ? (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
                <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Assignment Completed</h3>
                <p className="text-slate-500 mb-6">You have already submitted this assignment.</p>
                <div className="p-6 bg-primary/10 rounded-2xl inline-block text-left">
                  <p className="text-sm font-bold text-primary mb-1">Your Total Score:</p>
                  <p className="text-3xl font-black text-primary">
                    {existingSubmission.total_marks_awarded} / {existingSubmission.total_possible_marks}
                  </p>
                </div>
                <div className="mt-8 space-y-4 text-left">
                  {existingSubmission.answers && Object.entries(existingSubmission.answers).map(([qid, ans]: [string, any]) => (
                    <div key={qid} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400">{ans.question_type?.replace("_", " ") || "QUESTION"}</span>
                        <span className="font-bold text-primary">{ans.marks_awarded} / {ans.total_marks}</span>
                      </div>
                      <p className="font-semibold text-slate-800 text-sm mb-2">{ans.question_title}</p>
                      <div className="space-y-2 mb-3">
                        <div className="p-2 bg-white rounded-lg border border-slate-100 text-xs">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Your Answer</p>
                          <p className="text-slate-700 font-medium">{ans.answer || <span className="italic text-slate-400">No answer provided</span>}</p>
                        </div>
                        {ans.marks_awarded < ans.total_marks && (
                          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
                            <p className="text-[10px] font-bold uppercase text-emerald-400 mb-1">Correct Answer</p>
                            <p className="text-emerald-700 font-medium">{ans.correct_answer || "N/A"}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 italic bg-white p-2 rounded border border-slate-100">{ans.feedback}</p>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setSelectedAssignment(null)}
                  className="mt-8 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Back to Assignments
                </button>
              </div>
            ) : isOverdue ? (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
                <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Deadline Passed</h3>
                <p className="text-slate-500 mb-6">This assignment is no longer accepting submissions.</p>
                <button 
                  onClick={() => setSelectedAssignment(null)}
                  className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Back to Assignments
                </button>
              </div>
            ) : currentQuestion ? (
              <motion.div 
                key={currentQuestion.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
                      {currentQuestion.type.replace("_", " ")}
                    </span>
                    <span className="text-slate-400 text-xs font-medium">• {currentQuestion.type === "python_program" ? currentQuestion.total_marks : currentQuestion.marks} Marks</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">Question {currentQuestionIndex + 1} of {selectedAssignment.questions.length}</span>
                </div>

                {submissionStatus && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "mb-6 p-4 rounded-2xl flex items-center gap-3 font-bold text-sm",
                      submissionStatus.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                    )}
                  >
                    {submissionStatus.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    {submissionStatus.message}
                  </motion.div>
                )}
                
                <h2 className="text-2xl font-bold text-slate-900 mb-8 leading-tight">
                  {currentQuestion.question}
                </h2>

                {currentQuestion.type === "mcq" && (
                  <div className="grid gap-3">
                    {currentQuestion.options.map((opt, i) => {
                      const label = String.fromCharCode(65 + i);
                      return (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.01, x: 5 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setAnswers({ ...answers, [currentQuestion.id]: label })}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            answers[currentQuestion.id] === label 
                              ? "bg-primary/5 border-primary text-primary" 
                              : "border-slate-100 hover:border-slate-200 text-slate-700"
                          )}
                        >
                          <span className={cn(
                            "w-10 h-10 flex items-center justify-center rounded-xl font-bold transition-all",
                            answers[currentQuestion.id] === label ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                          )}>
                            {label}
                          </span>
                          <span className="font-medium">{opt}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === "short_answer" && (
                  <textarea
                    value={answers[currentQuestion.id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [currentQuestion.id]: e.target.value })}
                    className="w-full min-h-[200px] p-6 rounded-2xl border-2 border-slate-100 focus:border-primary outline-none transition-all text-lg leading-relaxed"
                    placeholder="Type your answer here..."
                  />
                )}

                {currentQuestion.type === "python_program" && (
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <ListChecks size={16} />
                        Visible Test Cases
                      </h4>
                      <div className="grid gap-2">
                        {currentQuestion.test_cases.map((tc, i) => (
                          <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 text-xs">
                            <div className="flex justify-between mb-1">
                              <span className="font-bold text-slate-400 uppercase tracking-wider">Test Case {i + 1}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-slate-400 mb-1">Input:</p>
                                <code className="bg-slate-50 px-2 py-1 rounded block">{tc.input || "(none)"}</code>
                              </div>
                              <div>
                                <p className="text-slate-400 mb-1">Expected Output:</p>
                                <code className="bg-slate-50 px-2 py-1 rounded block">{tc.expected}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

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
                        value={answers[currentQuestion.id] || ""}
                        onChange={(e) => setAnswers({ ...answers, [currentQuestion.id]: e.target.value })}
                        className="w-full min-h-[300px] p-6 bg-transparent text-slate-100 font-mono text-sm outline-none resize-none leading-relaxed"
                        placeholder="# Write your Python code here..."
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        disabled={runningTests || !answers[currentQuestion.id]}
                        onClick={runPythonTests}
                        className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-all flex items-center gap-2"
                      >
                        {runningTests ? "Running..." : "Run & Test Code"}
                      </button>
                    </div>
                    {testResults && (
                      <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <h4 className="text-sm font-bold text-slate-700 mb-2">Test Results</h4>
                        {testResults.map((res, i) => (
                          <div key={i} className={cn(
                            "p-3 rounded-xl border text-xs space-y-2",
                            res.passed ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                          )}>
                            <div className="flex justify-between items-center font-bold">
                              <span>Test Case {i + 1}</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px]",
                                res.passed ? "bg-emerald-200" : "bg-red-200"
                              )}>{res.passed ? "PASSED" : "FAILED"}</span>
                            </div>
                            {!res.passed && (
                              <div className="grid grid-cols-2 gap-2 opacity-80">
                                <div>
                                  <p className="mb-1">Expected:</p>
                                  <code className="block bg-white/50 p-1 rounded">{res.expected}</code>
                                </div>
                                <div>
                                  <p className="mb-1">Actual:</p>
                                  <code className="block bg-white/50 p-1 rounded">{res.actual || "(no output)"}</code>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-8 pt-8 border-t border-slate-100 flex justify-between items-center">
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handlePrev}
                      disabled={currentQuestionIndex === 0}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50"
                    >
                      Previous
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNext}
                      disabled={currentQuestionIndex === selectedAssignment.questions.length - 1}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50"
                    >
                      Next
                    </motion.button>
                  </div>

                  <div className="flex gap-2">
                    {currentQuestionIndex === selectedAssignment.questions.length - 1 && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={isSubmitting}
                        onClick={handleSubmitAssignment}
                        className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 shadow-lg shadow-primary/20"
                      >
                        {isSubmitting ? "Grading & Submitting..." : "Finish Assignment"}
                      </motion.button>
                    )}
                  </div>
                </div>
                
                {/* Manual AI Grading display removed to restrict it to submission only */}
              </motion.div>
            ) : null}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
              <BookOpen size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Select an Assignment</h3>
            <p className="text-slate-500 text-center max-w-xs">
              Choose an assignment from the sidebar to start your attempt.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
