import { useDispatch, useSelector } from "react-redux";
import {
  fetchDashboard,
  setDashboardFilters,
  loadDashboardPreferences,
  saveDashboardPreferences,
} from "../dashbord.slice";

export const useDashboard = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector((state) => state.dashboard);

  return {
    ...dashboard,
    load: () => dispatch(fetchDashboard()),
    setFilters: (filters) => dispatch(setDashboardFilters(filters)),
    loadPreferences: () => dispatch(loadDashboardPreferences()),
    savePreferences: (payload) => dispatch(saveDashboardPreferences(payload)),
  };
};
