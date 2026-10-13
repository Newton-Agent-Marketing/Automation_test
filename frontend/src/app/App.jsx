import { Provider } from "react-redux";
import { store } from "./app.store";
import AppRouters from "./App.routers";

const App = () => (
  <Provider store={store}>
    <AppRouters />
  </Provider>
);

export default App;
