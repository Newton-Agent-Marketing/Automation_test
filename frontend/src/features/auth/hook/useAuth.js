import { useDispatch, useSelector } from "react-redux";
import {
  hydrateUser,
  loginUser,
  logoutUser,
  registerUser,
  updateUserProfile,
} from "../auth.slice";

export const useAuth = () => {
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);

  return {
    ...auth,
    isAuthenticated: Boolean(auth.user),
    register: (payload) => dispatch(registerUser(payload)).unwrap(),
    login: (payload) => dispatch(loginUser(payload)).unwrap(),
    logout: () => dispatch(logoutUser()),
    hydrate: () => dispatch(hydrateUser()),
    updateProfile: (payload) => dispatch(updateUserProfile(payload)).unwrap(),
  };
};

export default useAuth;
