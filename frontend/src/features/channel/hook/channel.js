import { useDispatch, useSelector } from "react-redux";
import {
  connectGenericChannel,
  connectMetaAccount,
  selectMetaAccount,
  connectMcpServer,
  disconnectGenericChannel,
  disconnectMetaAccount,
  fetchChannelStatus,
  fetchMetaAccounts,
  getMetaOAuthUrl,
  metaOAuthCallback,
  getGoogleOAuthUrl,
  googleOAuthCallback,
  connectGoogleMcpServer,
  fetchGoogleAccounts,
  selectGoogleAccount,
  connectGoogleAccount,
  disconnectGoogleAccount,
} from "../channel.slice";

export const useChannel = () => {
  const dispatch = useDispatch();
  const channel = useSelector((state) => state.channel);

  return {
    ...channel,
    loadStatus: () => dispatch(fetchChannelStatus()),
    getOAuthUrl: (params) => dispatch(getMetaOAuthUrl(params)).unwrap(),
    handleOAuthCallback: (payload) => dispatch(metaOAuthCallback(payload)).unwrap(),
    connectMcpServer: (payload) => dispatch(connectMcpServer(payload)).unwrap(),
    fetchAccounts: (token) => dispatch(fetchMetaAccounts(token)).unwrap(),
    connectMeta: (payload) => dispatch(connectMetaAccount(payload)).unwrap(),
    selectMetaAccount: (payload) => dispatch(selectMetaAccount(payload)).unwrap(),
    disconnectMeta: (payload) => dispatch(disconnectMetaAccount(payload)).unwrap(),
    getGoogleOAuthUrl: (params) => dispatch(getGoogleOAuthUrl(params)).unwrap(),
    handleGoogleOAuthCallback: (payload) => dispatch(googleOAuthCallback(payload)).unwrap(),
    connectGoogleMcpServer: (payload) => dispatch(connectGoogleMcpServer(payload)).unwrap(),
    fetchGoogleAccounts: (token) => dispatch(fetchGoogleAccounts(token)).unwrap(),
    selectGoogleAccount: (payload) => dispatch(selectGoogleAccount(payload)).unwrap(),
    connectGoogle: (payload) => dispatch(connectGoogleAccount(payload)).unwrap(),
    disconnectGoogle: (payload) => dispatch(disconnectGoogleAccount(payload)).unwrap(),
    connectGeneric: (payload) => dispatch(connectGenericChannel(payload)).unwrap(),
    disconnectGeneric: (payload) => dispatch(disconnectGenericChannel(payload)).unwrap(),
  };
};

export default useChannel;
