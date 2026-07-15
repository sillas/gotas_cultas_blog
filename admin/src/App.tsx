import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Callback } from "./pages/Callback";
import { PostsList } from "./pages/PostsList";
import { PostEditor } from "./pages/PostEditor";
import { Metrics } from "./pages/Metrics";

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PostsList />} />
          <Route path="/posts/new" element={<PostEditor />} />
          <Route path="/posts/:slug" element={<PostEditor />} />
          <Route path="/metrics" element={<Metrics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
