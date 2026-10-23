import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Please provide a valid email address"],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    userType: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    avatarStoragePath: {
      type: String,
      default: "",
    },
    dashboardSettings: {
      startDate: { type: String, default: "" },
      endDate: { type: String, default: "" },
      preset: { type: String, default: "last_7d" },
      channel: { type: String, default: "Meta Ads" },
      accountId: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;