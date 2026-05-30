import { useAuth } from '../hooks/useAuth'; // Assuming useAuth is in src/hooks/useAuth

// This function needs to be used within a React component or hook
// because it uses useAuth().
// For non-component contexts, you'd need to pass the logout function directly.
export const useAuthFetch = () => {
  const { token, logout } = useAuth();

  const authFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = {
      ...init?.headers,
      'Authorization': `Bearer ${token}`,
    };
    const response = await fetch(input, { ...init, headers });

    if (response.status === 401) {
      logout(); // Automatically logs out and redirects
    }
    return response;
  };
  return authFetch;
};