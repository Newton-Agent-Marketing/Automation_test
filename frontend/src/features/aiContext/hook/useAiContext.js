import { useDispatch, useSelector } from "react-redux";
import {
  fetchAiContext,
  saveAiContext,
  resetAiContext,
  deleteNodeAsync,
  setSelectedNodeId,
  setPickerAnchorNodeId,
  setDrawerNodeId,
  clearValidationAlert,
  clearMessages,
  updateViewport,
  updateNodePosition,
  updateNodeData,
  deleteNode,
  addStartContextNode,
  addNodeFromPicker,
  connectNodes,
  removeEdge,
} from "../aiContext.slice";

export const useAiContext = () => {
  const dispatch = useDispatch();
  const aiContext = useSelector((state) => state.aiContext);
  const user = useSelector((state) => state.auth?.user);

  return {
    ...aiContext,
    loadContext: () => dispatch(fetchAiContext()),
    saveCurrentContext: (payload) => dispatch(saveAiContext(payload)).unwrap(),
    resetCurrentContext: () => dispatch(resetAiContext()).unwrap(),
    selectNode: (id) => dispatch(setSelectedNodeId(id)),
    openPicker: (sourceNodeId) => dispatch(setPickerAnchorNodeId(sourceNodeId)),
    closePicker: () => dispatch(setPickerAnchorNodeId(null)),
    openDrawer: (nodeId) => dispatch(setDrawerNodeId(nodeId)),
    closeDrawer: () => dispatch(setDrawerNodeId(null)),
    dismissAlert: () => dispatch(clearValidationAlert()),
    dismissMessages: () => dispatch(clearMessages()),
    setViewport: (viewport) => dispatch(updateViewport(viewport)),
    moveNode: (id, x, y) => dispatch(updateNodePosition({ id, x, y })),
    editNode: (id, data) => dispatch(updateNodeData({ id, ...data })),
    removeNode: (id) => dispatch(deleteNodeAsync(id)),
    addStartNode: () => dispatch(addStartContextNode({ userName: user?.name || "Customer User" })),
    addNodeToCanvas: (sourceNodeId, nodeType) =>
      dispatch(addNodeFromPicker({ sourceNodeId, nodeType })),
    linkNodes: (sourceId, targetId) =>
      dispatch(connectNodes({ sourceId, targetId })),
    unlinkEdge: (edgeId) => dispatch(removeEdge(edgeId)),
  };
};

export default useAiContext;
