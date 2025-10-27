export interface AIInputSecondProps {
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  theme?: "dark" | "light";
  showSearchToggle?: boolean;
  showFileUpload?: boolean;
  onSubmit?: (value: string, file?: File) => void;
  sendButtonIcon?: React.ReactNode;
  searchButtonIcon?: React.ReactNode;
}



declare global {
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onerror: ((this: SpeechRecognition, ev: any) => any) | null;
    onnomatch: ((this: SpeechRecognition, ev: any) => any) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  }

 export interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }

  export interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}


export interface AIInputVariant04Props {
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  title?: string
  typingAnimation?: boolean
  showMic?: boolean
  showBubbleTail?: boolean
  onSubmit?: (message: string) => void
  onMicClick?: () => void
}

export interface AIInputFiveProps {
  onSubmit: (msg: string) => void
  placeholder?: string
  title?: string
  version?: string
}


// 🔹 Props for dynamic behavior
export interface AIInputSixProps {
  placeholder?: string
  temperature?: number
  pressure?: number
  status?: "READY" | "PROCESSING" | "ERROR" | string
  onSend?: (message: string) => Promise<void> | void
  onRecordStart?: () => void
  onRecordStop?: () => void
}

export type Model = {
  name: string;
  description?: string;
  icon?: React.ReactNode;
};

export type AIInputSevenProps = {
  models?: Model[];
  defaultModel?: string;
  onSend?: (data: {
    value: string;
    selectedModel: string;
    fileName?: string;
    isPrivacyMode: boolean;
  }) => void;
};