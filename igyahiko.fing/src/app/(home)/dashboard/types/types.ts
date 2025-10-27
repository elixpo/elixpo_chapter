import { TemplateLogo } from "../../../../../public/assets/images/images";
export interface PlayGroundProjects {
  id: string;
  title: string;
  describtion: string | null;
  template: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  startMark: { isMarked: boolean }[];
}


export type PlayGroundTableTypesProps = {
  projects?: PlayGroundProjects[];
  onUpdate?: (project: PlayGroundProjects) => void;
  onDelete?: (projectId: string) => void;
  onDuplicate?: (project: PlayGroundProjects) => void;
};

export interface EditProjectProps {
  title: string;
  describtion: string;
}
export interface SelectedTempProps {
     title: string;
     template:  "REACT" | "NEXTJS" | "EXPRESS" | "HONO" | "ANGULAR" | "VUE";
     describtion?: string;
}

export type TemplateModalProps = {
     isOpen: boolean;
     onSubmit: (data: SelectedTempProps) => void;
     onClose: () => void;
     
}

export interface TemplateOptions {
     id: string;
     name: string;
     describtion: string;
     icon: string;
     color: string;
     popularity: number;
     tags: string[];
     features: string[];
     category: "fullstack" | "backend" | "frontend"

}

export const templates: TemplateOptions[] = [
  {
    id: "react",
    name: "React",
    describtion:
      "A JavaScript library for building user interfaces with component-based architecture",
    icon: TemplateLogo.React,
    color: "#61DAFB",
    popularity: 5,
    tags: ["UI", "Frontend", "JavaScript"],
    features: ["Component-Based", "Virtual DOM", "JSX Support"],
    category: "frontend",
  },
  {
    id: "nextjs",
    name: "Next.js",
    describtion:
      "The React framework for production with server-side rendering and static site generation",
    icon: TemplateLogo.Next,
    color: "#000000",
    popularity: 4,
    tags: ["React", "SSR", "Fullstack"],
    features: ["Server Components", "API Routes", "File-based Routing"],
    category: "fullstack",
  },
  {
    id: "express",
    name: "Express",
    describtion:
      "Fast, unopinionated, minimalist web framework for Node.js to build APIs and web applications",
    icon: TemplateLogo.Express,
    color: "#000000",
    popularity: 4,
    tags: ["Node.js", "API", "Backend"],
    features: ["Middleware", "Routing", "HTTP Utilities"],
    category: "backend",
  },
  {
    id: "vue",
    name: "Vue.js",
    describtion:
      "Progressive JavaScript framework for building user interfaces with an approachable learning curve",
    icon: TemplateLogo.Vue,
    color: "#4FC08D",
    popularity: 4,
    tags: ["UI", "Frontend", "JavaScript"],
    features: ["Reactive Data Binding", "Component System", "Virtual DOM"],
    category: "frontend",
  },
  {
    id: "hono",
    name: "Hono",
    describtion:
      "Fast, lightweight, built on Web Standards. Support for any JavaScript runtime.",
    icon: TemplateLogo.Hono,
    color: "#e36002",
    popularity: 3,
    tags: ["Node.js", "TypeScript", "Backend"],
    features: [
      "Dependency Injection",
      "TypeScript Support",
      "Modular Architecture",
    ],
    category: "backend",
  },
  {
    id: "angular",
    name: "Angular",
    describtion:
      "Angular is a web framework that empowers developers to build fast, reliable applications.",
    icon: TemplateLogo.Angular,
    color: "#DD0031",
    popularity: 3,
    tags: ["React", "Fullstack", "JavaScript"],
    features: [
      "Reactive Data Binding",
      "Component System",
      "Virtual DOM",
      "Dependency Injection",
      "TypeScript Support",
    ],
    category: "fullstack",
  },
];
