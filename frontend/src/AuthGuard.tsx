import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function AuthGuard({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const location = useLocation();
  return authenticated ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace state={{ from: location }} />
  );
}
