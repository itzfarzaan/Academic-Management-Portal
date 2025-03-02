require('dotenv').config()
const mongoose = require("mongoose");
const connect = mongoose.connect(process.env.MONGODB_URI,{});


// check connection 
connect.then(() => {
  console.log("Database connected Successfully");
})
  .catch(() => {
    console.log("Database could not be connected");
  });

// Lecturer Schema
const LecturerSchema = new mongoose.Schema({
    lecturer_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: () => new mongoose.Types.ObjectId(),
    unique: true 
    },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    classesTaught: [{ type: String }]
});

// Student Schema
const StudentSchema = new mongoose.Schema({
student_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: () => new mongoose.Types.ObjectId(),
    unique: true 
},
name: { type: String, required: true },
rollnumber: { type: String, required: true, unique: true },
password: { type: String, required: true },
class: { type: String, ref: "Class", required: true }  
});

// Class Schema
const ClassSchema = new mongoose.Schema({
classID: { type: String, required: true, unique: true },
branch: { type: String, required: true },
semester: { type: Number, required: true },
subjects: [{ type: String }],
subjectCount: [
  {
    subject: { type: String, ref: "Class" },
    count: {type: String}
}],
timeTable: [
  {
    day: { type: String, required: true },
    hours: { type: Map, of: String }
  }
  ]
});

// Attendance Schema
const AttendanceSchema = new mongoose.Schema({
classID: { type: String, ref: "Class", required: true },
day: { type: String, required: true },
date: { type: Date, required: true },
hourWiseAttendance: [
    {
    hour: { type: String, required: true },
    updated: { type: Boolean, required: true },
    subject: { type: String, required: true },
    lecturer_id: { type: String, ref: "Lecturer", required: true },
    student_data: [
        {
        rollnumber: { type: String, ref: "Student", required: true },
        isPresent: { type: Boolean, required: true }
        }
    ]
    }
],
totalHours: { type: Number, required: true }
});

// Subject-Lecturer Assignment Schema
const SubjectAssignmentSchema = new mongoose.Schema({
    classID: { 
        type: String,
        ref: 'Class',
        required: true 
    },
    subject: { 
        type: String,
        required: true 
    },
    lecturer_id: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lecturer',
        required: true 
    },
    lecturer_name: {
        type: String,
        required: true
    }
});
SubjectAssignmentSchema.index({ classID: 1, subject: 1 }, { unique: true });

// Marks Schema
const MarksSchema = new mongoose.Schema({
    student: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true 
    },
    marks: [{
        subject: { type: String, required: true },
        CIE1: { type: Number, default: 0 },
        CIE2: { type: Number, default: 0 },
        Assignment: { type: Number, default: 0 }
    }]
});



// Export models
const Lecturer = mongoose.model("Lecturer", LecturerSchema);
const Student = mongoose.model("Student", StudentSchema);
const Class = mongoose.model("Class", ClassSchema);
const Attendance = mongoose.model("Attendance", AttendanceSchema);
const SubjectAssignment = mongoose.model("SubjectAssignment", SubjectAssignmentSchema);
const Marks = mongoose.model("Marks", MarksSchema);

module.exports = { Lecturer, Student, Class, Attendance, SubjectAssignment, Marks };