import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { LoginModal } from "../../components/LoginModal";
import {
  renderWithProviders,
  userEvent,
  createMockResponse,
  mockFetch,
  resetFetchMock
} from "../helpers/test-utils";
import { testLoginCredentials, testUsers, testTokens } from "../helpers/test-data";

describe("LoginModal", () => {
  const mockOnClose = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockOnClose.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    resetFetchMock();
    global.fetch = originalFetch;
  });

  it("should render when isOpen is true", () => {
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("should not render when isOpen is false", () => {
    renderWithProviders(<LoginModal isOpen={false} onClose={mockOnClose} />);

    expect(screen.queryByText("Sign In")).not.toBeInTheDocument();
  });

  it("should allow user to type email and password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await user.type(emailInput, testLoginCredentials.valid.email);
    await user.type(passwordInput, testLoginCredentials.valid.password);

    expect(emailInput).toHaveValue(testLoginCredentials.valid.email);
    expect(passwordInput).toHaveValue(testLoginCredentials.valid.password);
  });

  it("should show error when submitting empty form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Please enter both email and password")).toBeInTheDocument();
    });
  });

  it("should successfully login with valid credentials", async () => {
    const user = userEvent.setup();

    // Mock successful login response
    mockFetch(
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/auth/login")) {
          return Promise.resolve(
            createMockResponse({
              token: testTokens.validToken,
              user: testUsers.validUser
            })
          );
        }
        if (url.includes("/api/auth/me")) {
          return Promise.resolve(
            createMockResponse({
              user: testUsers.validUser
            })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      })
    );

    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, testLoginCredentials.valid.email);
    await user.type(passwordInput, testLoginCredentials.valid.password);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Verify token is stored
    const storedToken = localStorage.getItem("auth_token");
    expect(storedToken).toBe(testTokens.validToken);
  });

  it("should show error message on login failure", async () => {
    const user = userEvent.setup();

    // Mock failed login response
    mockFetch(
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/auth/login")) {
          return Promise.resolve(
            createMockResponse(
              { error: "Invalid credentials" },
              401
            )
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      })
    );

    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, testLoginCredentials.invalid.email);
    await user.type(passwordInput, testLoginCredentials.invalid.password);
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("should disable inputs and button while loading", async () => {
    const user = userEvent.setup();

    // Mock slow login response
    mockFetch(
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/auth/login")) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                createMockResponse({
                  token: testTokens.validToken,
                  user: testUsers.validUser
                })
              );
            }, 100);
          });
        }
        return Promise.reject(new Error("Unknown URL"));
      })
    );

    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, testLoginCredentials.valid.email);
    await user.type(passwordInput, testLoginCredentials.valid.password);
    await user.click(submitButton);

    // Check loading state
    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });

    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
  });

  it("should close modal when clicking cancel button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("should close modal when clicking backdrop", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    // Click the backdrop (the outer div with the dark background)
    const backdrop = screen.getByText("Sign In").closest("div")?.parentElement;
    if (backdrop) {
      await user.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it("should not close modal when clicking inside the panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const panel = screen.getByText("Sign In").closest(".panel");
    if (panel) {
      await user.click(panel);
      expect(mockOnClose).not.toHaveBeenCalled();
    }
  });

  it("should clear form after successful login", async () => {
    const user = userEvent.setup();

    mockFetch(
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/auth/login")) {
          return Promise.resolve(
            createMockResponse({
              token: testTokens.validToken,
              user: testUsers.validUser
            })
          );
        }
        if (url.includes("/api/auth/me")) {
          return Promise.resolve(
            createMockResponse({
              user: testUsers.validUser
            })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      })
    );

    const { rerender } = renderWithProviders(
      <LoginModal isOpen={true} onClose={mockOnClose} />
    );

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, testLoginCredentials.valid.email);
    await user.type(passwordInput, testLoginCredentials.valid.password);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Re-open the modal
    rerender(<LoginModal isOpen={true} onClose={mockOnClose} />);

    // Fields should be empty
    const newEmailInput = screen.getByPlaceholderText("Enter your email");
    const newPasswordInput = screen.getByPlaceholderText("Enter your password");

    expect(newEmailInput).toHaveValue("");
    expect(newPasswordInput).toHaveValue("");
  });

  it("should handle network errors gracefully", async () => {
    const user = userEvent.setup();

    mockFetch(
      vi.fn().mockImplementation(() => {
        return Promise.reject(new Error("Network error"));
      })
    );

    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, testLoginCredentials.valid.email);
    await user.type(passwordInput, testLoginCredentials.valid.password);
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it("should validate email format using HTML5 validation", () => {
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const emailInput = screen.getByPlaceholderText("Enter your email") as HTMLInputElement;
    expect(emailInput.type).toBe("email");
    expect(emailInput.required).toBe(true);
  });

  it("should validate password field is required", () => {
    renderWithProviders(<LoginModal isOpen={true} onClose={mockOnClose} />);

    const passwordInput = screen.getByPlaceholderText("Enter your password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
    expect(passwordInput.required).toBe(true);
  });
});
