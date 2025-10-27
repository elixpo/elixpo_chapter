import { cn } from '@/lib/utils';
import React from 'react';

type ColorSwatch = {
  name: string;
  hexColor: string;
  description?: string;
};

type ColorThemeProps = {
  title: string;
  swatches: ColorSwatch[];
  className?: string;
};

type ThemeContentProps = {
  colorGuide: ColorThemeProps[] | undefined;
};

export const ThemeContent = ({ colorGuide }: ThemeContentProps) => {
  if (!colorGuide || colorGuide.length === 0) {
    return (
      <div className="text-sm text-muted-foreground font-mono">
        No color guide available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {colorGuide.map((section, i) => (
        <ColorTheme
          key={i}
          title={section.title}
          swatches={section.swatches}
        />
    
      ))}
     
    </div>
  );
};

export const ColorTheme = ({
  swatches,
  title,
  className,
}: ColorThemeProps) => {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <h3 className="text-lg font-mono">{title}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        {swatches.map((sw) => (
          <ColorSwatchItem key={sw.name} name={sw.name} value={sw.hexColor} />
        ))}
        
      </div>
    </div>
  );
};

type ColorSwatchProps = {
  name: string;
  value: string;
  className?: string;
};

const ColorSwatchItem = ({ name, value, className }: ColorSwatchProps) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        style={{ backgroundColor: value }}
        className="w-12 h-12 rounded-lg border border-border/20 flex-shrink-0"
      />
      <div>
        <h4 className="text-sm font-mono">{name}</h4>
        <p className="font-mono text-xs uppercase text-muted-foreground">
          {value}
        </p>
      </div>
    </div>
  );
};
