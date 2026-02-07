import '../styles/auth/login.css';
import '../../../utils/auth/login';
import '../../../utils/auth/helperFunction';

export default function LoginPage() {
  return (
    document.title = 'Login - LixBlogs',
    <div className="w-full md:w-1/2 flex flex-col justify-center px-10 py-12 bg-[#10141E]">
      <div className="flex flex-col max-w-md w-full mx-auto">
        <div className="flex items-center mb-10">
          <div className="h-12 w-12 rounded-full bg-[url('../../../CSS/IMAGES/logo.png')] bg-cover mr-3"></div>
        </div>

        <form className="flex flex-col gap-4">
          <div id="inputLabel">
            <label className="block text-[#7ba8f0] mb-1 text-[1em] font-bold" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value="ayushbhatt633@gmail.com"
              autoComplete="off"
              required
              className="w-full px-4 py-2 rounded-lg bg-[#1D202A] text-white border border-[#313647] focus:outline-none focus:border-[#7ba8f0] transition"
            />
          </div>
          <div id="otpLabel" className="hidden">
            <label className="block text-[#7ba8f0] mb-1 text-[1em] font-bold" htmlFor="otp">
              OTP
            </label>
            <div className="flex gap-2">
              {[...Array(6)].map((_, i) => (
                <input
                  key={i}
                  maxLength={1}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-12 h-12 text-center text-xl rounded-lg bg-[#1D202A] text-white border border-[#313647] focus:outline-none focus:border-[#7ba8f0] transition"
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <label className="flex items-center text-[#888]">
              <input
                type="checkbox"
                id="rememberMe"
                className="appearance-none h-5 w-5 rounded-md bg-[#1D202A] border border-[#313647] checked:bg-[#7ba8f0] checked:border-[#7ba8f0] focus:outline-none transition-all duration-200 mr-2 relative"
              />
              <span> Remember Me </span>
            </label>
            <a href="#" className="text-[#7ba8f0] text-[1.1em] font-bold hover:underline">
              Forgot password?
            </a>
          </div>
          <button
            type="button"
            id="loginBtn"
            className="mt-4 px-6 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-lg rounded-full font-semibold shadow transition-all duration-200"
          >
            <span> Sign in </span>
          </button>
        </form>
        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-[#1D202A]"></div>
          <span className="mx-4 text-[#888] text-[1em] font-bold">Or continue with</span>
          <div className="flex-grow border-t border-[#1D202A]"></div>
        </div>

        <div className="flex gap-4 flex-row">
          <button
            id="loginGoogle"
            className="flex items-center justify-center gap-2 w-1/2 py-2 rounded-lg bg-[#1D202A] text-white border border-[#313647] hover:bg-[#23395d] transition"
          >
            {/* Replace with a React icon */}
            <span className="text-xl text-[#888]">G</span>
            <span> Google </span>
          </button>

          <button
            id="loginGithub"
            className="flex items-center justify-center gap-2 w-1/2 py-2 rounded-lg bg-[#1D202A] text-white border border-[#313647] hover:bg-[#23395d] transition"
          >
            {/* Replace with a React icon */}
            <span className="text-xl text-[#888]">GH</span>
            <span> GitHub </span>
          </button>
        </div>
      </div>
    </div>
  );
}
