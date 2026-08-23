"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toAuthEmail } from "@/lib/memberAuth";
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordPolicy";

export default function LoginPage() {
  const [memberId, setMemberId] = useState("");
  const [passward, setPassward] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [regMemberId, setRegMemberId] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"login" | "register" | null>(null);
  const router = useRouter();

  const getFriendlyErrorMessage = (action: "login" | "register", err: unknown) => {
    const base = action === "login" ? "ログイン" : "登録";
    if (err && typeof err === "object") {
      const maybe = err as Partial<{
        message: string;
        details: string;
        hint: string;
        code: string;
      }>;
      const parts = [maybe.message, maybe.details, maybe.hint, maybe.code].filter(
        (value) => typeof value === "string" && value.trim().length > 0
      );
      if (parts.length > 0) {
        return `${base}に失敗しました: ${parts.join(" / ")}`;
      }
    }
    if (err instanceof Error && err.message) {
      return `${base}に失敗しました: ${err.message}`;
    }
    return `${base}に失敗しました。時間をおいて再度お試しください。`;
  };

  const handleLogin = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!memberId.trim() || !passward.trim()) {
      setStatus("会員IDとパスワードを入力してください。");
      setStatusIsError(true);
      return;
    }

    setIsLoading(true);
    setLoadingAction("login");
    setStatus("ログイン情報を確認しています…");
    setStatusIsError(false);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(memberId),
        password: passward,
      });

      if (signInError || !data.session) {
        setStatus("会員IDまたはパスワードが間違っています。");
        setStatusIsError(true);
        if (typeof window !== "undefined") {
          localStorage.removeItem("yochiLoggedIn");
          localStorage.removeItem("yochiMemberId");
          window.dispatchEvent(new Event("yochi-auth-changed"));
        }
        return;
      }

      setStatus("ログインしました。");
      setStatusIsError(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("yochiLoggedIn", "true");
        localStorage.setItem("yochiMemberId", memberId);
        window.dispatchEvent(new Event("yochi-auth-changed"));
      }
      router.push("/");
    } catch (err) {
      console.error("handleLogin error:", err);
      setStatus(getFriendlyErrorMessage("login", err));
      setStatusIsError(true);
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleToggleRegister = (open: boolean) => {
    setIsRegisterOpen(open);
    setRegMemberId("");
    setRegPassword("");
    setRegPasswordConfirm("");
    setStatus(null);
    setStatusIsError(false);
  };

  const handleRegisterSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (!regMemberId.trim() || !regPassword.trim() || !regPasswordConfirm.trim()) {
      setStatus("会員ID・パスワード・パスワード（確認）を入力してください。");
      setStatusIsError(true);
      return;
    }

    if (!isPasswordValid(regPassword)) {
      setStatus(PASSWORD_POLICY_MESSAGE);
      setStatusIsError(true);
      return;
    }

    if (regPassword !== regPasswordConfirm) {
      setStatus("パスワードが一致しません。もう一度入力してください。");
      setStatusIsError(true);
      return;
    }

    setIsLoading(true);
    setLoadingAction("register");
    setStatus("登録処理を実行しています…");
    setStatusIsError(false);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: regMemberId, password: regPassword }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(body?.error ?? "登録に失敗しました。");
        setStatusIsError(true);
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(regMemberId),
        password: regPassword,
      });

      if (signInError || !signInData.session) {
        setStatus("登録は完了しましたが、自動ログインに失敗しました。ログインし直してください。");
        setStatusIsError(true);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("yochiLoggedIn", "true");
        localStorage.setItem("yochiMemberId", regMemberId);
        window.dispatchEvent(new Event("yochi-auth-changed"));
      }
      router.push("/");
    } catch (err) {
      console.error("handleRegisterSubmit error:", err);
      setStatus(getFriendlyErrorMessage("register", err));
      setStatusIsError(true);
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#F0E4D8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
        {!isRegisterOpen ? (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold text-[#3A2C25]">会員ログイン</h1>
              <p className="text-sm text-[#6B5A4E]">登録済みの会員IDとパスワードを入力してください</p>
            </div>

            <form className="space-y-4" onSubmit={handleLogin}>
              <label className="block text-sm font-semibold text-[#4D3F36]">
                会員ID
                <input
                  type="text"
                  name="memberId"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#D3C5B9] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="例：よちヨチ保育園2026"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-[#4D3F36]">
                パスワード
                <input
                  type="password"
                  name="passward"
                  value={passward}
                  onChange={(e) => setPassward(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#D3C5B9] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="パスワード"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-brand text-white font-semibold py-3 transition hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading && loadingAction === "login" ? "確認中..." : "ログイン"}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => handleToggleRegister(true)}
                className="text-[#6B5A4E] font-semibold underline"
              >
                新規登録へ
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold text-[#3A2C25]">新規登録</h1>
              <p className="text-sm text-[#6B5A4E]">会員IDとパスワードを入力してください</p>
            </div>

            <form className="space-y-4" onSubmit={handleRegisterSubmit}>
              <label className="block text-sm font-semibold text-[#4D3F36]">
                会員ID
                <input
                  type="text"
                  name="regMemberId"
                  value={regMemberId}
                  onChange={(e) => setRegMemberId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#D3C5B9] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="例：よちヨチ保育園2026"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-[#4D3F36]">
                パスワード
                <input
                  type="password"
                  name="regPassword"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#D3C5B9] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="8文字以上・2種類以上の文字種"
                  required
                />
                <span className="mt-1 block text-xs font-normal text-[#8A7B6E]">
                  8文字以上、かつ英大文字・英小文字・数字・記号のうち2種類以上を組み合わせてください。
                </span>
              </label>

              <label className="block text-sm font-semibold text-[#4D3F36]">
                パスワード（確認）
                <input
                  type="password"
                  name="regPasswordConfirm"
                  value={regPasswordConfirm}
                  onChange={(e) => setRegPasswordConfirm(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#D3C5B9] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="もう一度同じパスワードを入力"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-brand text-white font-semibold py-3 transition hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading && loadingAction === "register" ? "登録中..." : "新規登録"}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => handleToggleRegister(false)}
                className="text-[#6B5A4E] font-semibold underline"
              >
                ログインへ
              </button>
            </div>
          </>
        )}

        {status && (
          <p className={`text-sm text-center ${statusIsError ? "text-red-600 font-semibold" : "text-[#6B5A4E]"}`}>
            {status}
          </p>
        )}

        <div className="text-center">
          <Link href="/" className="text-[#6B5A4E] font-semibold underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
