import { Image } from '@radix-ui/react-avatar'
import { Link } from 'lucide-react'
import React from 'react'
import { LOGO } from '../../../public/images/images'
interface Props {
     children: React.ReactNode
}
const AuthLayout = ({children}: Props) => {
  return (
     <div className="relative min-h-screen flex justify-center items-center overflow-x-clip  overflow-hidden">
     <div className="absolute inset-x-0 bottom-0 h-[50vh] flame flame1" />
      <div className="absolute inset-x-0 bottom-0 h-[50vh] flame flame2" />
      <div className="absolute inset-x-0 bottom-0 h-[50vh] flame flame3" />
   <div className="relative z-10 w-full max-w-xl px-3 md:px-0">
       {children}
       </div>
      
    <style>{`
        .flame {
          background: linear-gradient(to top,
            rgba(14,165,233,0.9) 0%,
            rgba(59,130,246,0.7) 30%,
            rgba(37,99,235,0.5) 60%,
            transparent 100%);
          filter: blur(40px);
          opacity: 0.7;
          mix-blend-mode: screen;
        }

        .flame1 {
          animation: rise1 6s ease-in-out infinite alternate;
        }
        .flame2 {
          animation: rise2 8s ease-in-out infinite alternate;
          opacity: 0.5;
        }
        .flame3 {
          animation: rise3 10s ease-in-out infinite alternate;
          opacity: 0.4;
        }

        @keyframes rise1 {
          0% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-40px) scaleY(1.3); }
          100% { transform: translateY(-80px) scaleY(1.1); }
        }
        @keyframes rise2 {
          0% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-60px) scaleY(1.4); }
          100% { transform: translateY(-100px) scaleY(1.2); }
        }
        @keyframes rise3 {
          0% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-80px) scaleY(1.5); }
          100% { transform: translateY(-120px) scaleY(1.3); }
        }
      `}</style>

     
    </div>
  )
}

export default AuthLayout