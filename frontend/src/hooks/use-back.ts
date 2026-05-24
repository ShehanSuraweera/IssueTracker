import { useNavigate, useLocation } from "react-router-dom";

export function useBack(fallback = "/") {
  const navigate = useNavigate();
  const { key } = useLocation();
  return () => {
    if (key !== "default") navigate(-1);
    else navigate(fallback);
  };
}
