export const SUBJECTS_BY_YEAR = {
  "1st Year": [
    "Maths",
    "Tamil",
    "BEEE",
    "Engineering Physics",
    "Programming In C",
    "Programming In C Laboratory",
    "Communicative English",
    "Programming In Python",
    "Programming In Python Laboratory",
    "Web Application Development",
    "Web Application Development Laboratory"
  ],
  "2nd Year": [
    "Digital Principles and computer Architecture",
    "Data Structure",
    "Data Structure Laboratory",
    "Database Management systems",
    "Database Management systems Laboratory",
    "Object oriented design and programming",
    "Object oriented design and programming Laboratory",
    "Communicative English",
    "Computer Networks",
    "Computational Thinking",
    "Operating Systems With Linux Administration",
    "Foundation of Data Science",
    "Object Oriented Software Engineering",
    "Operating Systems and Linux Administration Practical Laboratory",
    "Foundations of Data Science Laboratory"
  ]
};

export const SUBJECTS = [...new Set([...SUBJECTS_BY_YEAR["1st Year"], ...SUBJECTS_BY_YEAR["2nd Year"]])];
