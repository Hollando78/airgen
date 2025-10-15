import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginModal } from "../../components/LoginModal";
import { userEvent } from "../helpers/test-utils";

const loginMock = vi.fn();
const onCloseMock = vi.fn();

vi.mock("../../contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("../../contexts/AuthContext")>("../../contexts/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      token: null,
      login: loginMock,
      logout: vi.fn(),
      isLoading: false,
      error: null,
      mfaRequired: false,
      mfaTempToken: null,
      verifyMfa: vi.fn(),
      setSession: vi.fn()
    })
  };
});

describe("LoginModal", () => {
  beforeEach(() => {
    loginMock.mockReset();
    onCloseMock.mockReset();
  });

  it("renders fields when open", () => {
    render(<LoginModal isOpen onClose={onCloseMock} />);

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("submits credentials via auth context", async () => {
    const user = userEvent.setup();
    render(<LoginModal isOpen onClose={onCloseMock} />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/enter your password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("test@example.com", "password123");
  });

  it("invokes onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginModal isOpen onClose={onCloseMock} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCloseMock).toHaveBeenCalled();
  });
});
