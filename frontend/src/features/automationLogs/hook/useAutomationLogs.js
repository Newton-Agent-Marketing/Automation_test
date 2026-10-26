import { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchExecutions,
  deleteExecution,
  clearAllExecutions,
  setSearchTerm,
  setStatusFilter,
  setDateFilter,
  setSortBy,
  setPage,
  toggleExpandRun,
  setSelectedNodeDetail,
  clearError,
  handleSocketExecutionUpdate,
} from "../automationLogs.slice";
import { getSocket } from "../../chat/service/chat.socket";

export const useAutomationLogs = () => {
  const dispatch = useDispatch();
  const {
    executions,
    loading,
    error,
    filters,
    expandedRunIds,
    selectedNodeDetail,
  } = useSelector((state) => state.automationLogs);

  // Load executions when filters change
  useEffect(() => {
    dispatch(fetchExecutions());
  }, [
    dispatch,
    filters.searchTerm,
    filters.status,
    filters.dateRange,
    filters.sortBy,
    filters.page,
  ]);

  // Connect Socket.IO for real-time live execution updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onExecutionUpdate = (payload) => {
      dispatch(handleSocketExecutionUpdate(payload));
    };

    socket.on("automation:execution_update", onExecutionUpdate);

    return () => {
      socket.off("automation:execution_update", onExecutionUpdate);
    };
  }, [dispatch]);

  const onSearchChange = useCallback(
    (term) => {
      dispatch(setSearchTerm(term));
    },
    [dispatch]
  );

  const onStatusChange = useCallback(
    (status) => {
      dispatch(setStatusFilter(status));
    },
    [dispatch]
  );

  const onDateChange = useCallback(
    (dateRange) => {
      dispatch(setDateFilter(dateRange));
    },
    [dispatch]
  );

  const onSortChange = useCallback(
    (sort) => {
      dispatch(setSortBy(sort));
    },
    [dispatch]
  );

  const onPageChange = useCallback(
    (page) => {
      dispatch(setPage(page));
    },
    [dispatch]
  );

  const onToggleExpand = useCallback(
    (runId) => {
      dispatch(toggleExpandRun(runId));
    },
    [dispatch]
  );

  const onOpenNodeDetail = useCallback(
    (node, executionId) => {
      dispatch(setSelectedNodeDetail({ node, executionId }));
    },
    [dispatch]
  );

  const onCloseNodeDetail = useCallback(() => {
    dispatch(setSelectedNodeDetail(null));
  }, [dispatch]);

  const onClearError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  const onDeleteExecution = useCallback(
    (executionId) => {
      return dispatch(deleteExecution(executionId)).unwrap();
    },
    [dispatch]
  );

  const onClearAllExecutions = useCallback(() => {
    return dispatch(clearAllExecutions()).unwrap();
  }, [dispatch]);

  return {
    executions,
    loading,
    error,
    filters,
    expandedRunIds,
    selectedNodeDetail,
    onSearchChange,
    onStatusChange,
    onDateChange,
    onSortChange,
    onPageChange,
    onToggleExpand,
    onOpenNodeDetail,
    onCloseNodeDetail,
    onClearError,
    onDeleteExecution,
    onClearAllExecutions,
  };
};

export default useAutomationLogs;
