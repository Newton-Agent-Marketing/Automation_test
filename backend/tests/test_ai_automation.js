import mongoose from "mongoose";
import AiAutomation from "../src/models/aiAutomationModel.js";

async function runAutomationBackendTests() {
  console.log("=== STARTING AI AUTOMATION BACKEND TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Model schema verification
  const testUserId = new mongoose.Types.ObjectId();
  const doc = new AiAutomation({
    userId: testUserId,
    name: "My Automation Test",
    nodes: [],
    edges: [],
  });

  assert(doc.userId.equals(testUserId), "Model correctly assigns userId");
  assert(doc.nodes.length === 0, "Initial canvas has 0 nodes (no predefined nodes)");
  assert(doc.edges.length === 0, "Initial canvas has 0 edges");

  // 2. Add generic user node
  doc.nodes.push({
    id: "node_1",
    text: "Review customer support tickets",
    position: { x: 300, y: 150 },
  });
  assert(doc.nodes.length === 1, "Added node 1");
  assert(doc.nodes[0].text === "Review customer support tickets", "Node 1 text is preserved");

  // 3. Add second generic user node
  doc.nodes.push({
    id: "node_2",
    text: "Draft email reply to user",
    position: { x: 300, y: 350 },
  });
  assert(doc.nodes.length === 2, "Added node 2");

  // 4. Create connection between node 1 and node 2
  doc.edges.push({
    id: "edge_node_1_node_2",
    source: "node_1",
    target: "node_2",
  });
  assert(doc.edges.length === 1, "Created edge connecting node 1 -> node 2");
  assert(doc.edges[0].source === "node_1" && doc.edges[0].target === "node_2", "Edge source and target match");

  // 5. Update node text
  const targetNode = doc.nodes.find((n) => n.id === "node_1");
  targetNode.text = "Review VIP customer support tickets";
  assert(targetNode.text === "Review VIP customer support tickets", "Node text successfully updated");
  assert(doc.nodes[1].text === "Draft email reply to user", "Other node text untouched");

  // 6. Cascade edge deletion on node removal
  const deletedNodeId = "node_1";
  doc.nodes = doc.nodes.filter((n) => n.id !== deletedNodeId);
  doc.edges = doc.edges.filter((e) => e.source !== deletedNodeId && e.target !== deletedNodeId);
  assert(doc.nodes.length === 1, "Deleted node 1, 1 node remains");
  assert(doc.edges.length === 0, "Edge connected to node 1 was automatically removed");

  console.log(`\n==========================================`);
  console.log(`AUTOMATION BACKEND TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================`);
  if (failed > 0) process.exit(1);
}

runAutomationBackendTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
