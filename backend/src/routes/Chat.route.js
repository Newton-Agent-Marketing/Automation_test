import { Router } from "express";
import { ChatAgentController } from "../controller/chat.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

router.post("/chat", ChatAgentController.handleChatStream);
router.get("/conversations", ChatAgentController.listConversations);
router.get("/history/:conversationId", ChatAgentController.getChatHistory);
router.patch("/conversation/:conversationId", ChatAgentController.renameConversation);
router.delete("/conversation/:conversationId", ChatAgentController.deleteConversation);
router.get("/preparation/:conversationId", ChatAgentController.getPreparationSession);
router.post("/preparation/action", ChatAgentController.handlePreparationAction);

export default router;
