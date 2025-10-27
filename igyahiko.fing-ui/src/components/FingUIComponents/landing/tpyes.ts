import { LucideIcon } from "lucide-react";
/* for footer3d */
export interface FooterProps {
  email: string
  location?: string
  socials?: { name: string; href: string }[]
  navLeft?: { name: string; href: string }[]
  navRight?: { name: string; href: string }[]
  language?: string
  credits?: string
  legal?: { name: string; href: string }[]
  model?: React.ReactNode // custom 3D model
}

/* navbarv1 */
export interface NavOption {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavbarV1Props {
  logoLight?: string;
  logoDark?: string;
  brandName?: string;
  navOptions?: NavOption[];
  rightActions?: React.ReactNode;
  activeColor?: string;
}



//header pro v1

export interface HeaderItem {
  text: string;
  productName: string;
  link: string;
  icon?: React.ReactNode; // optional custom icon
}

export interface HeaderProProps {
  items?: HeaderItem[]; // List of items to choose from
  randomize?: boolean; // If true, picks random item
  defaultIndex?: number; // If randomize=false, shows this index
  rightActions?: React.ReactNode; // Custom right-side actions
}
