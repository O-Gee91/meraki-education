export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["post_audience"]
          author_id: string | null
          body: string
          class_id: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["post_audience"]
          author_id?: string | null
          body: string
          class_id?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["post_audience"]
          author_id?: string | null
          body?: string
          class_id?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          grade_level: number
          guardian_email: string
          guardian_name: string
          id: string
          notes: string | null
          phone: string | null
          status: string
          student_name: string
        }
        Insert: {
          created_at?: string
          grade_level?: number
          guardian_email: string
          guardian_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          student_name: string
        }
        Update: {
          created_at?: string
          grade_level?: number
          guardian_email?: string
          guardian_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          student_name?: string
        }
        Relationships: []
      }
      assessment_answers: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string
          response: Json
          submission_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id: string
          response?: Json
          submission_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string
          response?: Json
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          answer_key: Json
          assessment_id: string
          created_at: string
          id: string
          kind: string
          lock_order: boolean
          options: Json
          points: number
          position: number
          prompt: string
          rubric: string | null
          updated_at: string
        }
        Insert: {
          answer_key?: Json
          assessment_id: string
          created_at?: string
          id?: string
          kind?: string
          lock_order?: boolean
          options?: Json
          points?: number
          position?: number
          prompt: string
          rubric?: string | null
          updated_at?: string
        }
        Update: {
          answer_key?: Json
          assessment_id?: string
          created_at?: string
          id?: string
          kind?: string
          lock_order?: boolean
          options?: Json
          points?: number
          position?: number
          prompt?: string
          rubric?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_submissions: {
        Row: {
          assessment_id: string
          auto_score: number
          created_at: string
          graded_at: string | null
          id: string
          is_late: boolean
          late_accepted: boolean
          manual_score: number
          status: string
          student_id: string
          submitted_at: string
          total_points: number
          updated_at: string
        }
        Insert: {
          assessment_id: string
          auto_score?: number
          created_at?: string
          graded_at?: string | null
          id?: string
          is_late?: boolean
          late_accepted?: boolean
          manual_score?: number
          status?: string
          student_id: string
          submitted_at?: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          auto_score?: number
          created_at?: string
          graded_at?: string | null
          id?: string
          is_late?: boolean
          late_accepted?: boolean
          manual_score?: number
          status?: string
          student_id?: string
          submitted_at?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assignment_id: string | null
          available_from: string | null
          class_id: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          grammar_check_enabled: boolean
          id: string
          instructions: string | null
          kind: string
          published: boolean
          shuffle_choices: boolean
          time_limit_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          available_from?: string | null
          class_id: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          grammar_check_enabled?: boolean
          id?: string
          instructions?: string | null
          kind?: string
          published?: boolean
          shuffle_choices?: boolean
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          available_from?: string | null
          class_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          grammar_check_enabled?: boolean
          id?: string
          instructions?: string | null
          kind?: string
          published?: boolean
          shuffle_choices?: boolean
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_standards: {
        Row: {
          assignment_id: string
          id: string
          standard_id: string
        }
        Insert: {
          assignment_id: string
          id?: string
          standard_id: string
        }
        Update: {
          assignment_id?: string
          id?: string
          standard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_standards_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          body: string | null
          created_at: string
          file_upload_id: string | null
          id: string
          is_late: boolean
          late_override_at: string | null
          late_override_by: string | null
          late_override_reason: string | null
          late_penalty_override_pct: number | null
          status: string
          student_id: string
          submitted_at: string
          teacher_note: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          body?: string | null
          created_at?: string
          file_upload_id?: string | null
          id?: string
          is_late?: boolean
          late_override_at?: string | null
          late_override_by?: string | null
          late_override_reason?: string | null
          late_penalty_override_pct?: number | null
          status?: string
          student_id: string
          submitted_at?: string
          teacher_note?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          body?: string | null
          created_at?: string
          file_upload_id?: string | null
          id?: string
          is_late?: boolean
          late_override_at?: string | null
          late_override_by?: string | null
          late_override_reason?: string | null
          late_penalty_override_pct?: number | null
          status?: string
          student_id?: string
          submitted_at?: string
          teacher_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          available_from: string | null
          category: string
          class_id: string
          closes_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          points_possible: number
          rubric_id: string | null
          status: string
          submission_mode: string
          title: string
        }
        Insert: {
          available_from?: string | null
          category?: string
          class_id: string
          closes_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          points_possible?: number
          rubric_id?: string | null
          status?: string
          submission_mode?: string
          title: string
        }
        Update: {
          available_from?: string | null
          category?: string
          class_id?: string
          closes_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          points_possible?: number
          rubric_id?: string | null
          status?: string
          submission_mode?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          date: string
          id: string
          note: string | null
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          date?: string
          id?: string
          note?: string | null
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          date?: string
          id?: string
          note?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_notes: {
        Row: {
          assignment_id: string | null
          class_id: string | null
          created_at: string
          date: string
          id: string
          kind: string
          notes: string | null
          reason: string | null
          recorded_by: string | null
          scored_zero: boolean
          severity: number
          student_id: string
        }
        Insert: {
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          kind?: string
          notes?: string | null
          reason?: string | null
          recorded_by?: string | null
          scored_zero?: boolean
          severity?: number
          student_id: string
        }
        Update: {
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          kind?: string
          notes?: string | null
          reason?: string | null
          recorded_by?: string | null
          scored_zero?: boolean
          severity?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_notes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          audience: Database["public"]["Enums"]["post_audience"]
          audiences: Database["public"]["Enums"]["post_audience"][]
          category: string
          class_id: string | null
          class_ids: string[] | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          grade_level: number | null
          id: string
          location: string | null
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["post_audience"]
          audiences?: Database["public"]["Enums"]["post_audience"][]
          category?: string
          class_id?: string | null
          class_ids?: string[] | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          grade_level?: number | null
          id?: string
          location?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["post_audience"]
          audiences?: Database["public"]["Enums"]["post_audience"][]
          category?: string
          class_id?: string | null
          class_ids?: string[] | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          grade_level?: number | null
          id?: string
          location?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_staff_notes: {
        Row: {
          checkin_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_staff_notes_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          mood: number
          note: string | null
          student_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          mood?: number
          note?: string | null
          student_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          mood?: number
          note?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_co_teachers: {
        Row: {
          added_by: string | null
          class_id: string
          created_at: string
          id: string
          permission_level: string
          teacher_id: string
        }
        Insert: {
          added_by?: string | null
          class_id: string
          created_at?: string
          id?: string
          permission_level?: string
          teacher_id: string
        }
        Update: {
          added_by?: string | null
          class_id?: string
          created_at?: string
          id?: string
          permission_level?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_co_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_co_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade_level: number | null
          id: string
          name: string
          period: string | null
          room: string | null
          subject: string | null
          teacher_id: string | null
          teacher_name: string
          term: string
          timezone: string
          weights: Json
        }
        Insert: {
          created_at?: string
          grade_level?: number | null
          id?: string
          name: string
          period?: string | null
          room?: string | null
          subject?: string | null
          teacher_id?: string | null
          teacher_name?: string
          term?: string
          timezone?: string
          weights?: Json
        }
        Update: {
          created_at?: string
          grade_level?: number | null
          id?: string
          name?: string
          period?: string | null
          room?: string | null
          subject?: string | null
          teacher_id?: string | null
          teacher_name?: string
          term?: string
          timezone?: string
          weights?: Json
        }
        Relationships: []
      }
      detentions: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          notes: string | null
          reason: string
          scheduled_date: string
          status: string
          strike_count: number
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          scheduled_date?: string
          status?: string
          strike_count?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          scheduled_date?: string
          status?: string
          strike_count?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detentions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detentions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          discussion_id: string
          id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          discussion_id: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          discussion_id?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_posts_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "discussion_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          assignment_id: string | null
          class_id: string
          closed: boolean
          created_at: string
          created_by: string | null
          due_date: string | null
          graded: boolean
          id: string
          points_possible: number
          prompt: string
          required_replies: number
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          class_id: string
          closed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          graded?: boolean
          id?: string
          points_possible?: number
          prompt: string
          required_replies?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          class_id?: string
          closed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          graded?: boolean
          id?: string
          points_possible?: number
          prompt?: string
          required_replies?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      essay_reviews: {
        Row: {
          answer_id: string
          created_at: string
          created_by: string | null
          id: string
          issues: Json
          suggested_points: number | null
          summary: string | null
        }
        Insert: {
          answer_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          issues?: Json
          suggested_points?: number | null
          summary?: string | null
        }
        Update: {
          answer_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issues?: Json
          suggested_points?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "essay_reviews_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "assessment_answers"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          audience: Database["public"]["Enums"]["post_audience"]
          class_id: string | null
          created_at: string
          description: string | null
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          student_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          audience?: Database["public"]["Enums"]["post_audience"]
          class_id?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          student_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["post_audience"]
          class_id?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          student_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_changes: {
        Row: {
          assignment_id: string | null
          assignment_title: string | null
          changed_at: string
          changed_by: string | null
          id: string
          new_feedback: string | null
          new_score: number | null
          old_feedback: string | null
          old_score: number | null
          reason: string | null
          student_id: string
        }
        Insert: {
          assignment_id?: string | null
          assignment_title?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_feedback?: string | null
          new_score?: number | null
          old_feedback?: string | null
          old_score?: number | null
          reason?: string | null
          student_id: string
        }
        Update: {
          assignment_id?: string | null
          assignment_title?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_feedback?: string | null
          new_score?: number | null
          old_feedback?: string | null
          old_score?: number | null
          reason?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_changes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_changes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_reset_log: {
        Row: {
          assessment_id: string | null
          assignment_id: string | null
          class_id: string | null
          created_at: string
          id: string
          previous_comment: string | null
          previous_points: number | null
          reason: string
          reopened_until: string | null
          reset_by: string | null
          student_id: string
        }
        Insert: {
          assessment_id?: string | null
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          previous_comment?: string | null
          previous_points?: number | null
          reason?: string
          reopened_until?: string | null
          reset_by?: string | null
          student_id: string
        }
        Update: {
          assessment_id?: string | null
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          previous_comment?: string | null
          previous_points?: number | null
          reason?: string
          reopened_until?: string | null
          reset_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_reset_log_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_reset_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_reset_log_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_reset_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          assignment_id: string
          comment: string | null
          id: string
          is_draft: boolean
          points_earned: number | null
          posted_at: string | null
          posted_by: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          comment?: string | null
          id?: string
          is_draft?: boolean
          points_earned?: number | null
          posted_at?: string | null
          posted_by?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          comment?: string | null
          id?: string
          is_draft?: boolean
          points_earned?: number | null
          posted_at?: string | null
          posted_by?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          name: string
          visibility: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          name: string
          visibility?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          name?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_profiles: {
        Row: {
          class_changes: number
          created_at: string
          hero_class: string
          id: string
          quest_started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_changes?: number
          created_at?: string
          hero_class: string
          id?: string
          quest_started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_changes?: number
          created_at?: string
          hero_class?: string
          id?: string
          quest_started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrity_strike_reversals: {
        Row: {
          behavior_note_id: string
          id: string
          original_class_id: string | null
          original_created_at: string
          original_date: string
          original_kind: string
          original_notes: string
          original_recorded_by: string | null
          original_severity: number
          reversal_reason: string
          reversed_at: string
          student_id: string
        }
        Insert: {
          behavior_note_id: string
          id?: string
          original_class_id?: string | null
          original_created_at: string
          original_date: string
          original_kind: string
          original_notes: string
          original_recorded_by?: string | null
          original_severity: number
          reversal_reason: string
          reversed_at?: string
          student_id: string
        }
        Update: {
          behavior_note_id?: string
          id?: string
          original_class_id?: string | null
          original_created_at?: string
          original_date?: string
          original_kind?: string
          original_notes?: string
          original_recorded_by?: string | null
          original_severity?: number
          reversal_reason?: string
          reversed_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrity_strike_reversals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string | null
          id: string
          status: string
          student_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          status?: string
          student_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          id: string
          signed_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          signed_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          signed_in_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          recipient_id: string
          sender_id: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id: string
          sender_id: string
          subject?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id?: string
          sender_id?: string
          subject?: string
        }
        Relationships: []
      }
      override_audit_log: {
        Row: {
          created_at: string
          id: string
          new_value: boolean
          old_value: boolean
          penalty_override_pct: number | null
          reason: string | null
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_value: boolean
          old_value: boolean
          penalty_override_pct?: number | null
          reason?: string | null
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_value?: boolean
          old_value?: boolean
          penalty_override_pct?: number | null
          reason?: string | null
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "override_audit_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          class_id: string
          closed: boolean
          created_at: string
          created_by: string | null
          id: string
          options: string[]
          question: string
          share_results: boolean
        }
        Insert: {
          class_id: string
          closed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          options?: string[]
          question: string
          share_results?: boolean
        }
        Update: {
          class_id?: string
          closed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          options?: string[]
          question?: string
          share_results?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "polls_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          added_by: string | null
          class_id: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          link: string | null
          student_id: string
          title: string
        }
        Insert: {
          added_by?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          link?: string | null
          student_id: string
          title: string
        }
        Update: {
          added_by?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          link?: string | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          class_id: string | null
          created_at: string
          group_id: string | null
          id: string
          link: string | null
          pinned: boolean
        }
        Insert: {
          author_id: string
          body: string
          class_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          link?: string | null
          pinned?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          class_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          link?: string | null
          pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "posts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      proofread_marks: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          meaning: string | null
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          meaning?: string | null
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          meaning?: string | null
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          class_id: string
          comment: string | null
          created_by: string | null
          grade_pct: number | null
          id: string
          letter: string | null
          published: boolean
          student_id: string
          term: string
          updated_at: string
        }
        Insert: {
          class_id: string
          comment?: string | null
          created_by?: string | null
          grade_pct?: number | null
          id?: string
          letter?: string | null
          published?: boolean
          student_id: string
          term?: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          comment?: string | null
          created_by?: string | null
          grade_pct?: number | null
          id?: string
          letter?: string | null
          published?: boolean
          student_id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_scores: {
        Row: {
          assignment_id: string
          comment: string | null
          created_at: string
          graded_by: string | null
          id: string
          points_earned: number | null
          rubric_id: string | null
          selections: Json
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          comment?: string | null
          created_at?: string
          graded_by?: string | null
          id?: string
          points_earned?: number | null
          rubric_id?: string | null
          selections?: Json
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          comment?: string | null
          created_at?: string
          graded_by?: string | null
          id?: string
          points_earned?: number | null
          rubric_id?: string | null
          selections?: Json
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_scores_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_scores_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          criteria: Json
          description: string | null
          grade_level: number | null
          id: string
          subject: string | null
          title: string
          total_points: number
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          grade_level?: number | null
          id?: string
          subject?: string | null
          title: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          grade_level?: number | null
          id?: string
          subject?: string | null
          title?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          class_id: string
          col_index: number
          id: string
          row_index: number
          student_id: string
        }
        Insert: {
          class_id: string
          col_index?: number
          id?: string
          row_index?: number
          student_id: string
        }
        Update: {
          class_id?: string
          col_index?: number
          id?: string
          row_index?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_resources: {
        Row: {
          created_at: string
          description: string | null
          grade_level: number | null
          id: string
          kind: string
          payload: Json
          shared_by: string | null
          shared_by_name: string
          source_class_id: string | null
          subject: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          grade_level?: number | null
          id?: string
          kind: string
          payload?: Json
          shared_by?: string | null
          shared_by_name?: string
          source_class_id?: string | null
          subject?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          grade_level?: number | null
          id?: string
          kind?: string
          payload?: Json
          shared_by?: string | null
          shared_by_name?: string
          source_class_id?: string | null
          subject?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_resources_source_class_id_fkey"
            columns: ["source_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_access_requests: {
        Row: {
          created_at: string
          domain_approved: boolean
          email: string
          full_name: string
          id: string
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain_approved?: boolean
          email?: string
          full_name?: string
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain_approved?: boolean
          email?: string
          full_name?: string
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      standards: {
        Row: {
          code: string
          created_at: string
          description: string
          grade_level: number | null
          id: string
          subject: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          grade_level?: number | null
          id?: string
          subject?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          grade_level?: number | null
          id?: string
          subject?: string | null
        }
        Relationships: []
      }
      students: {
        Row: {
          chinese_name: string | null
          created_at: string
          first_name: string
          grade_level: number
          guardian_email: string | null
          guardian_user_id: string | null
          id: string
          is_tester: boolean
          last_name: string
          student_number: string | null
          user_id: string | null
        }
        Insert: {
          chinese_name?: string | null
          created_at?: string
          first_name: string
          grade_level?: number
          guardian_email?: string | null
          guardian_user_id?: string | null
          id?: string
          is_tester?: boolean
          last_name: string
          student_number?: string | null
          user_id?: string | null
        }
        Update: {
          chinese_name?: string | null
          created_at?: string
          first_name?: string
          grade_level?: number
          guardian_email?: string | null
          guardian_user_id?: string | null
          id?: string
          is_tester?: boolean
          last_name?: string
          student_number?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      submission_annotations: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          end_offset: number | null
          excerpt: string
          id: string
          mark_code: string | null
          mark_label: string | null
          mark_symbol: string | null
          start_offset: number | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          end_offset?: number | null
          excerpt?: string
          id?: string
          mark_code?: string | null
          mark_label?: string | null
          mark_symbol?: string | null
          start_offset?: number | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          end_offset?: number | null
          excerpt?: string
          id?: string
          mark_code?: string | null
          mark_label?: string | null
          mark_symbol?: string | null
          start_offset?: number | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_annotations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      can_manage_class: { Args: { _class_id: string }; Returns: boolean }
      can_manage_student: { Args: { _student_id: string }; Returns: boolean }
      can_see_audience: {
        Args: { _audience: Database["public"]["Enums"]["post_audience"] }
        Returns: boolean
      }
      can_see_audiences: {
        Args: { _audiences: Database["public"]["Enums"]["post_audience"][] }
        Returns: boolean
      }
      can_view_class: { Args: { _class_id: string }; Returns: boolean }
      can_view_grade: { Args: { _grade: number }; Returns: boolean }
      can_view_student: { Args: { _student_id: string }; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      co_teacher_level: { Args: { _class_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_school_staff_email: { Args: { _email: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      override_late_status: {
        Args: {
          _on_time: boolean
          _penalty_pct: number
          _reason: string
          _submission_id: string
        }
        Returns: undefined
      }
      owns_class_or_admin: { Args: { _class_id: string }; Returns: boolean }
      poll_results: {
        Args: { _poll_id: string }
        Returns: {
          option_index: number
          votes: number
        }[]
      }
      submission_is_late: {
        Args: { _assignment_id: string; _submitted_at: string }
        Returns: boolean
      }
      teaches_class: { Args: { _class_id: string }; Returns: boolean }
      teaches_grade: { Args: { _grade: number }; Returns: boolean }
      teaches_student_grade: { Args: { _student_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "parent"
      post_audience: "everyone" | "students" | "parents" | "teachers"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student", "parent"],
      post_audience: ["everyone", "students", "parents", "teachers"],
    },
  },
} as const
