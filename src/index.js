const express = require("express")
const path = require("path")
const bcrypt = require("bcrypt")
const bodyParser = require("body-parser")
const { Student, Lecturer, Class, Attendance, SubjectAssignment, Marks} = require("./config")
const mongoose = require("mongoose")
require('dotenv').config()

const app = express()

// Convert data into json
app.use(express.json())
app.use(express.static("views"))

app.use(express.urlencoded({ extended: false }))

// Use EJS as the view engine
app.set("view engine", "ejs")

// static file
app.use(express.static("public"))

// default loading page
app.get("/", (req, res) => {
  res.render("s_login")
})

// --------------------------------------
// ------- ROUTES TO RENDER PAGES -------
// --------------------------------------

app.get("/l_login", (req, res) => {
  res.render("l_login")
})

app.get("/s_login", (req, res) => {
  res.render("s_login")
})

app.get(`/l_homepage/:username`, (req, res) => {
    res.render("l_homepage");
});

app.get("/admin_page", (req, res) => {
  res.render("admin_page")
})

// app.get(`/s_homepage/:rollNumber`, (req, res) => {
//     res.render("s_homepage");
// });


// -------------------------------------------------------------------------
// --- ADMIN PAGE: ROUTES FOR ADDING STUDENTS, LECTURERS AND CLASSES -------
// -------------------------------------------------------------------------

// API to Fetch Classes
app.get("/api/classes", async (req, res) => {
    try {
        const classes = await Class.find({}, "classID");
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: "Error fetching classes" });
    }
});

// Route: Add Students to Database
app.post("/api/add-student", async (req, res) => {
    try {
        const { name, rollnumber, password, class: classID } = req.body;

        // Ensure the class exists
        const classExists = await Class.findOne({classID});
        if (!classExists) {
            return res.status(400).json({ message: "Invalid class selected" });
        }
        const newStudent = new Student({ name, rollnumber, password, class: classID });
        await newStudent.save();

        res.status(201).json({ message: "Student added successfully" });
    } catch (error) {
        res.status(500).json({ error: "Error adding student", details: error.message });
    }
});

// Route: Add Classes to Database
app.post("/add-class", async (req, res) => {
    try {
        let { classID, branch, semester, subjects, timeTable } = req.body;

        if (!classID || !branch || !semester || subjects.length === 0) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        if (!Array.isArray(timeTable) || timeTable.some(tt => typeof tt !== "object")) {
            return res.status(400).json({ success: false, message: "Invalid timeTable format." });
        }

        let newClass = new Class({ classID, branch, semester, subjects, timeTable });
        await newClass.save();
        res.json({ success: true, message: "Class added successfully!" });

    } catch (err) {
        res.status(500).json({ success: false, message: "Server error!", error: err.message });
    }
});

// Route: Add Lecturers to Database
app.post("/api/add-lecturer", async (req, res) => {
    try {
        const { name, username, password, classesTaught } = req.body;
        
        if (!Array.isArray(classesTaught)) {
            return res.status(400).json({ error: "classesTaught must be an array" });
        }

        const newLecturer = new Lecturer({
            name,
            username,
            password,
            classesTaught
        });

        await newLecturer.save();
        res.json({ message: "Lecturer added successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Error adding lecturer", details: error.message });
    }
});

// ------------------------------------------------------------
// --- ADMIN PAGE: SUBJECT-LECTURER ASSIGNMENT ROUTES ---------
// ------------------------------------------------------------
app.get("/api/subject-assignments", async (req, res) => {
    try {
        const assignments = await SubjectAssignment
            .find()
            .populate('lecturer_id', 'lecturer_id name');
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/subject-assignments", async (req, res) => {
    try {
        const { classID, subject, lecturer_id } = req.body;

        // Check if class exists and has the subject
        const classDoc = await Class.findOne({ classID });
        if (!classDoc) return res.status(400).json({ error: "Class not found" });
        if (!classDoc.subjects.includes(subject)) return res.status(400).json({ error: "Subject not found in class" });

        // Find lecturer
        const lecturer = await Lecturer.findOne({ lecturer_id });
        if (!lecturer) return res.status(400).json({ error: "Lecturer not found" });

        // Check for time conflicts
        const timeConflict = await checkTimeConflict(classDoc, subject, lecturer_id);
        if (timeConflict) {
            return res.status(400).json({ 
                error: "Time conflict: Lecturer already has a class during one or more periods of this subject" 
            });
        }

        // Create subject assignment
        const assignment = new SubjectAssignment({
            classID,
            subject,
            lecturer_id,
            lecturer_name: lecturer.name
        });

        // Update lecturer's classesTaught if needed
        if (!lecturer.classesTaught.includes(classID)) {
            await Lecturer.updateOne(
                { lecturer_id: lecturer_id },
                { $push: { classesTaught: classID } }
            );
        }

        await assignment.save();
        res.json({ message: "Subject assigned successfully" });

    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ error: "This subject is already assigned" });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Helper function to check for time conflicts
async function checkTimeConflict(newClass, newSubject, lecturer_id) {
    // Get all classes taught by this lecturer
    const lecturerAssignments = await SubjectAssignment.find({ lecturer_id });
    
    // Get all class documents for the lecturer's assignments
    const lecturerClasses = await Class.find({
        classID: { $in: lecturerAssignments.map(a => a.classID) }
    });

    // Check each day's timetable
    for (const day of newClass.timeTable) {
        const newSubjectHours = [];
        
        // Get hours where new subject is taught
        for (const [hour, subject] of Object.entries(day.hours)) {
            if (subject === newSubject) {
                newSubjectHours.push(parseInt(hour));
            }
        }

        // Check against each existing class
        for (const existingClass of lecturerClasses) {
            const existingDaySchedule = existingClass.timeTable.find(t => t.day === day.day);
            if (!existingDaySchedule) continue;

            // Get the subject taught in this class by this lecturer
            const existingAssignment = lecturerAssignments.find(a => a.classID === existingClass.classID);
            if (!existingAssignment) continue;

            // Check each hour where new subject would be taught
            for (const newHour of newSubjectHours) {
                // If lecturer already teaches any subject at this hour
                if (existingDaySchedule.hours[newHour] === existingAssignment.subject) {
                    return true; // Conflict found
                }
            }
        }
    }

    return false;
}

app.get("/api/lecturers", async (req, res) => {
    try {
        const lecturers = await Lecturer.find({}, { _id: 0, lecturer_id: 1, name: 1 });
        res.json(lecturers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/classes/:classID", async (req, res) => {
    try {
        const classDoc = await Class.findOne({ classID: req.params.classID });
        if (!classDoc) {
            return res.status(404).json({ error: "Class not found" });
        }
        res.json(classDoc);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------
// ------------ ADMIN DASHBOARD ROUTES ------------
// ------------------------------------------------
app.get('/api/students/count', async (req, res) => {
    try {
        const count = await Student.countDocuments();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/lecturers/count', async (req, res) => {
    try {
        const count = await Lecturer.countDocuments();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/classes/count', async (req, res) => {
    try {
        const count = await Class.countDocuments();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------
// --------- LECTURER DASHBOARD ROUTES ------------
// ------------------------------------------------

// Used in loading timetable
app.get('/api/class/schedule/:classID', async (req, res) => {
    try {
        const classDoc = await Class.findOne({ classID: req.params.classID });
        if (!classDoc) {
            return res.status(404).json({ error: "Class not found" });
        }
        res.json(classDoc);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get subject assignment for lecturer and class
app.get('/api/subject-assignments/find', async (req, res) => {
    const { classID, lecturer_id } = req.query;
    const assignment = await SubjectAssignment.findOne({ classID, lecturer_id });
    res.json(assignment);
});

// Updated class schedule route
app.get('/api/class/schedule', async (req, res) => {
    try {
        const { classID, date, subject } = req.query;
        const classDoc = await Class.findOne({ classID });
        const dayIndex = new Date(date).getDay() - 1;

        const daySchedule = classDoc.timeTable[dayIndex];
        
        const matchingHours = [];
        daySchedule.hours.forEach((subj, hour) => {
            if (subj === subject) {
                matchingHours.push(hour);
            }
        });
        
        res.json({ hours: matchingHours });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get students for a class
app.get('/api/students/:classID', async (req, res) => {
    const students = await Student.find({ class: req.params.classID })
                                .sort('rollnumber');
    res.json(students);
});

// Check if attendance is already marked
app.get('/api/attendance/check', async (req, res) => {
    const { classID, date, hour } = req.query;
    const attendance = await Attendance.findOne({
        classID,
        date: new Date(date),
        'hourWiseAttendance': {
            $elemMatch: {
                hour: hour,
                updated: true
            }
        }
    });
    res.json({ updated: !!attendance });
});

// Mark attendance
app.post('/api/attendance/mark', async (req, res) => {
    try {
        const { classID, date, hour, subject, lecturer_id, student_data } = req.body;
        
        const existingAttendance = await Attendance.findOne({
            classID,
            date: new Date(date),
            'hourWiseAttendance': {
                $elemMatch: {
                    hour: hour,
                    updated: true
                }
            }
        });

        if (existingAttendance) {
            return res.status(400).json({ 
                success: false, 
                error: 'Attendance already marked for this hour' 
            });
        }

        let attendance = await Attendance.findOne({
            classID,
            date: new Date(date)
        });

        if (!attendance) {
            attendance = new Attendance({
                classID,
                day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()],
                date: new Date(date),
                hourWiseAttendance: [],
                totalHours: 0
            });
        }

        attendance.hourWiseAttendance.push({
            hour,
            updated: true,
            subject,
            lecturer_id,
            student_data
        });
        attendance.totalHours = attendance.hourWiseAttendance.length;

        await attendance.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get lecturer by username
app.get('/api/lecturer/:username', async (req, res) => {
    try {
        const lecturer = await Lecturer.findOne({ username: req.params.username });
        if (!lecturer) {
            return res.status(404).json({ error: 'Lecturer not found' });
        }
        res.json(lecturer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --------- Subsection: Route for Marks Handling ------------
// Get student marks
app.get('/api/marks/:classID/:subject', async (req, res) => {
    try {
        const students = await Student.find({ class: req.params.classID });
        const marksPromises = students.map(async (student) => {
            const markRecord = await Marks.findOne({ student: student._id, 'marks.subject': req.params.subject });
            return {
                student_id: student._id,
                rollnumber: student.rollnumber,
                name: student.name,
                marks: markRecord ? markRecord.marks.find(m => m.subject === req.params.subject) : {
                    subject: req.params.subject,
                    CIE1: 0,
                    CIE2: 0,
                    Assignment: 0
                }
            };
        });
        const results = await Promise.all(marksPromises);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save/Update marks
app.post('/api/marks/update', async (req, res) => {
    try {
        const { student_id, subject, CIE1, CIE2, Assignment } = req.body;
        
        let markRecord = await Marks.findOne({ student: student_id });
        
        if (!markRecord) {
            markRecord = new Marks({
                student: student_id,
                marks: [{
                    subject,
                    CIE1,
                    CIE2,
                    Assignment
                }]
            });
        } else {
            const subjectIndex = markRecord.marks.findIndex(m => m.subject === subject);
            if (subjectIndex >= 0) {
                markRecord.marks[subjectIndex] = {
                    subject,
                    CIE1,
                    CIE2,
                    Assignment
                };
            } else {
                markRecord.marks.push({
                    subject,
                    CIE1,
                    CIE2,
                    Assignment
                });
            }
        }
        
        await markRecord.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --------- Subsection: Route for Insights ------------
app.get('/api/insights/general/:lecturer_id', async (req, res) => {
    try {
        const lecturer = await Lecturer.findOne({ lecturer_id: req.params.lecturer_id });
        let insights = [];
        
        for(const classID of lecturer.classesTaught) {
            const subject = await SubjectAssignment.findOne({ 
                classID, 
                lecturer_id: lecturer.lecturer_id 
            });
            
            const attendance = await Attendance.find({
                classID,
                'hourWiseAttendance': {
                    $elemMatch: {
                        lecturer_id: lecturer.lecturer_id.toString(),
                        subject: subject.subject
                    }
                }
            });
            
            const students = await Student.find({ class: classID });
            const marks = await Marks.find({
                'student': { $in: students.map(s => s._id) },
                'marks.subject': subject.subject
            });

            const totalHours = attendance.reduce((sum, att) => 
                sum + att.hourWiseAttendance.filter(h => 
                    h.lecturer_id === lecturer.lecturer_id.toString() && 
                    h.subject === subject.subject
                ).length, 0);

            const totalPresentees = attendance.reduce((sum, att) => 
                sum + att.hourWiseAttendance.reduce((s, h) => 
                    s + (h.lecturer_id === lecturer.lecturer_id.toString() && 
                         h.subject === subject.subject ? 
                         h.student_data.filter(sd => sd.isPresent).length : 0), 0
                ), 0);

            const studentsBelow40 = marks.filter(m => {
                const subjectMarks = m.marks.find(mk => mk.subject === subject.subject);
                const total = ((subjectMarks.CIE1 + subjectMarks.CIE2) / 2) + subjectMarks.Assignment;
                return (total / 30) * 100 < 40;
            }).length;

            insights.push({
                classID,
                subject: subject.subject,
                totalHours,
                totalStudents: students.length,
                totalPresentees,
                avgPresentees: totalPresentees / totalHours,
                presenteePercentage: (totalPresentees / (totalHours * students.length)) * 100,
                belowFortyCount: {
                    CIE1: marks.filter(m => (m.marks.find(mk => 
                        mk.subject === subject.subject).CIE1 / 20) * 100 < 40).length,
                    CIE2: marks.filter(m => (m.marks.find(mk => 
                        mk.subject === subject.subject).CIE2 / 20) * 100 < 40).length,
                    Overall: studentsBelow40,
                    Percentage: (studentsBelow40 / students.length) * 100
                }
            });
        }
        
        res.json(insights);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/insights/class/:classID/:lecturer_id', async (req, res) => {
    try {
        const { classID, lecturer_id } = req.params;
        
        const subject = await SubjectAssignment.findOne({ classID, lecturer_id });
        const attendance = await Attendance.find({
            classID,
            'hourWiseAttendance.lecturer_id': lecturer_id
        });
        
        const students = await Student.find({ class: classID }).sort('rollnumber');
        const marks = await Marks.find({
            'student': { $in: students.map(s => s._id) },
            'marks.subject': subject.subject
        });

        const totalHours = attendance.reduce((sum, att) => 
            sum + att.hourWiseAttendance.filter(h => 
                h.lecturer_id === lecturer_id
            ).length, 0);

        const studentAttendance = students.map(student => {
            const attended = attendance.reduce((sum, att) => 
                sum + att.hourWiseAttendance.filter(h => 
                    h.student_data.find(sd => 
                        sd.rollnumber === student.rollnumber && sd.isPresent
                    )
                ).length, 0);

            const studentMarks = marks.find(m => 
                m.student.toString() === student._id.toString()
            )?.marks.find(m => m.subject === subject.subject) || {
                CIE1: 0,
                CIE2: 0,
                Assignment: 0
            };

            return {
                rollnumber: student.rollnumber,
                name: student.name,
                attendedClasses: attended,
                attendancePercentage: (attended / totalHours) * 100,
                marks: studentMarks
            };
        });

        res.json({
            classInfo: {
                className: classID,
                subject: subject.subject,
                totalHours,
                weeklyHours: 6 // Assuming 6 hours per week
            },
            studentData: studentAttendance
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------
// --------- STUDENT DASHBOARD ROUTES ------------
// ------------------------------------------------

app.get('/s_homepage/:rollNumber', async (req, res) => {
    try {
      const rollNumber = req.params.rollNumber;
  
      // Fetch student data from the database
      const studentData = await Student.findOne({ rollnumber: rollNumber }); 
  
      if (!studentData) {
        return res.status(404).send('Student not found');
      }
  
      // Render the s_homepage.ejs template with student data
      res.render('s_homepage', { student: studentData });
    } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Route: For Student's general attendance stats
  app.get('/api/student-attendance/:rollNumber', async (req, res) => {
    try {
        const rollNumber = req.params.rollNumber;
        
        // Find all attendance records for the student's class
        const attendanceRecords = await Attendance.find({
            'hourWiseAttendance.student_data.rollnumber': rollNumber
        });

        // Calculate total hours and attended hours
        let totalHours = 0;
        let attendedHours = 0;

        attendanceRecords.forEach(record => {
            record.hourWiseAttendance.forEach(hourAttendance => {
                const studentAttendance = hourAttendance.student_data.find(
                    student => student.rollnumber === rollNumber
                );

                if (studentAttendance) {
                    totalHours++;
                    if (studentAttendance.isPresent) {
                        attendedHours++;
                    }
                }
            });
        });

        // Calculate percentage
        const attendancePercentage = totalHours > 0 
            ? ((attendedHours / totalHours) * 100).toFixed(2) 
            : 0;

        res.json({
            totalHours,
            attendedHours,
            attendancePercentage,
            attendanceRecords: attendanceRecords.map(record => ({
                date: record.date,
                hourWiseDetails: record.hourWiseAttendance.filter(
                    hourAttendance => hourAttendance.student_data.some(
                        student => student.rollnumber === rollNumber
                    )
                )
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: For subject-wise attendance
  app.get('/api/student-subject-attendance/:rollNumber', async (req, res) => {
    try {
        const rollNumber = req.params.rollNumber;
        
        // Find student's class
        const student = await Student.findOne({ rollnumber: rollNumber });
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Get the class's subjects from the Class model
        const classDetails = await Class.findOne({ classID: student.class });
        if (!classDetails) {
            return res.status(404).json({ error: "Class not found" });
        }

        // Prepare subject-wise attendance data
        const subjectAttendance = [];

        // Iterate through each subject in the class
        for (let subject of classDetails.subjects) {
            // Find subject assignments for this subject
            const subjectAssignment = await SubjectAssignment.findOne({ 
                classID: student.class,
                subject: subject 
            }).populate('lecturer_id', 'name');

            // Find attendance records for this subject
            const attendanceRecords = await Attendance.find({
                'hourWiseAttendance.subject': subject,
                'classID': student.class,
                'hourWiseAttendance.student_data.rollnumber': rollNumber
            });

            let totalClasses = 0;
            let attendedClasses = 0;

            attendanceRecords.forEach(record => {
                record.hourWiseAttendance.forEach(hourAttendance => {
                    if (hourAttendance.subject === subject) {
                        totalClasses++;
                        const studentAttendance = hourAttendance.student_data.find(
                            s => s.rollnumber === rollNumber
                        );
                        if (studentAttendance && studentAttendance.isPresent) {
                            attendedClasses++;
                        }
                    }
                });
            });

            // Only add subjects with assignments
            if (subjectAssignment) {
                subjectAttendance.push({
                    subject: subject,
                    lecturer: subjectAssignment.lecturer_name,
                    totalClasses,
                    attendedClasses,
                    attendancePercentage: totalClasses > 0 
                        ? ((attendedClasses / totalClasses) * 100).toFixed(2) 
                        : 0
                });
            }
        }

        res.json(subjectAttendance);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route: To retrieve student's marks
app.get('/api/student-marks/:rollNumber', async (req, res) => {
    try {
        const rollNumber = req.params.rollNumber;
        
        // Find the student
        const student = await Student.findOne({ rollnumber: rollNumber });
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Find marks for the student
        const marksRecord = await Marks.findOne({ student: student._id });
        
        // If no marks record exists, return empty marks
        if (!marksRecord) {
            return res.json({ marks: [] });
        }

        // Get class details to match subjects
        const classDetails = await Class.findOne({ classID: student.class });
        
        // Prepare marks data with additional context
        const marksData = marksRecord.marks.map(markEntry => {
            return {
                subject: markEntry.subject,
                CIE1: markEntry.CIE1,
                CIE2: markEntry.CIE2,
                Assignment: markEntry.Assignment,
                totalMarks: markEntry.CIE1 + markEntry.CIE2 + markEntry.Assignment
            };
        });

        res.json({ marks: marksData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
  

// ------------------------------------------------
// ---------- ROUTES FOR LOGGING IN ---------------
// ------------------------------------------------

// Route: Login for students
app.post("/login", async (req, res) => {
    try {
        const rollNumber = req.headers.rollnumber;
        const password = req.headers.password;
        
        const student = await Student.findOne({ rollnumber: rollNumber });
        if (!student) {
            return res.json({ success: false, error: "Roll Number is Invalid" });
        }

        if (password !== student.password) {
            return res.json({ success: false, error: "Invalid password" });
        }

        res.json({ success: true, redirect: `/s_homepage/${rollNumber}` });
    } catch (error) {
        res.json({ success: false, error: "Login failed" });
    }
});

app.post("/lecturer-login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const lecturer = await Lecturer.findOne({ username });
        
        if (!lecturer) {
            return res.status(401).json({ error: "Invalid username" });
        }
        
        if (password !== lecturer.password) {
            return res.status(401).json({ error: "Invalid password" });
        }

        res.json({ redirect: `/l_homepage/${username}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




const port = 5500
app.listen(port, () => {
  console.log(`Server running on port: ${port}`)
})