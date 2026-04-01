var express = require("express");
var router = express.Router();
let multer = require("multer");
let messageModel = require("../schemas/messages");
const { CheckLogin } = require("../utils/authHandler");

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
let upload = multer({ storage: storage });

// GET / - lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin
router.get("/", CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let messages = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: currentUserId }, { to: currentUserId }]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          otherUser: {
            $cond: {
              if: { $eq: ["$from", currentUserId] },
              then: "$to",
              else: "$from"
            }
          }
        }
      },
      {
        $group: {
          _id: "$otherUser",
          lastMessage: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$lastMessage" } },
      { $sort: { createdAt: -1 } }
    ]);
    await messageModel.populate(messages, [
      { path: "from", select: "username fullName avatarUrl" },
      { path: "to", select: "username fullName avatarUrl" }
    ]);
    res.send(messages);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// GET /:userID - lấy toàn bộ message giữa user hiện tại và userID
router.get("/:userID", CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let otherUserId = req.params.userID;
    let messages = await messageModel
      .find({
        $or: [
          { from: currentUserId, to: otherUserId },
          { from: otherUserId, to: currentUserId }
        ]
      })
      .sort({ createdAt: 1 })
      .populate("from", "username fullName avatarUrl")
      .populate("to", "username fullName avatarUrl");
    res.send(messages);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// POST / - gửi message
router.post("/", CheckLogin, upload.single("file"), async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let { to, text } = req.body;
    let messageContent;
    if (req.file) {
      messageContent = {
        type: "file",
        text: "/uploads/" + req.file.filename
      };
    } else {
      messageContent = {
        type: "text",
        text: text
      };
    }
    let newMessage = new messageModel({
      from: currentUserId,
      to: to,
      messageContent: messageContent
    });
    await newMessage.save();
    await newMessage.populate("from", "username fullName avatarUrl");
    await newMessage.populate("to", "username fullName avatarUrl");
    res.send(newMessage);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

module.exports = router;
