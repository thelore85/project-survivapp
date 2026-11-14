import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View, type PressableProps, type TextProps, type ViewProps } from 'react-native';
import { twMerge } from 'tailwind-merge';

/**
 * Componenti di base nello stile di React Native Reusables (il porting di shadcn/ui):
 * varianti con cva, classi unite con `cn`, colori dai token del tema in global.css.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const textVariants = cva('text-foreground', {
  variants: {
    variant: {
      body: 'text-base leading-6',
      small: 'text-sm leading-5',
      muted: 'text-sm leading-5 text-muted-foreground',
      label: 'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
      title: 'text-xl font-semibold',
      heading: 'text-base font-semibold',
    },
  },
  defaultVariants: { variant: 'body' },
});

export function Text({ className, variant, ...props }: TextProps & VariantProps<typeof textVariants>) {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />;
}

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-lg', {
  variants: {
    variant: {
      default: 'bg-primary active:opacity-80',
      outline: 'border border-border bg-card active:bg-muted',
      ghost: 'active:bg-muted',
      destructive: 'border border-danger bg-danger-soft active:opacity-80',
    },
    size: {
      default: 'min-h-[44px] px-4 py-2',
      sm: 'min-h-[36px] px-3 py-1.5',
      icon: 'h-11 w-11',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

const buttonTextVariants = cva('text-sm font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      destructive: 'text-danger',
    },
  },
  defaultVariants: { variant: 'default' },
});

interface ButtonProps extends Omit<PressableProps, 'children'>, VariantProps<typeof buttonVariants> {
  label?: string;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function Button({ label, icon, loading, variant, size, className, disabled, ...props }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), (disabled || loading) && 'opacity-50', className)}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" /> : icon}
      {label ? <RNText className={buttonTextVariants({ variant })}>{label}</RNText> : null}
    </Pressable>
  );
}

export function Card({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-xl border border-border bg-card p-4', className)} {...props} />;
}

const badgeVariants = cva('self-start rounded-full px-2.5 py-0.5', {
  variants: {
    tone: {
      neutral: 'bg-muted',
      primary: 'bg-accent',
      info: 'bg-info-soft',
      warning: 'bg-warning-soft',
      danger: 'bg-danger-soft',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'text-muted-foreground',
      primary: 'text-primary',
      info: 'text-info',
      warning: 'text-warning',
      danger: 'text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ label, tone, className }: { label: string; className?: string } & VariantProps<typeof badgeVariants>) {
  return (
    <View className={cn(badgeVariants({ tone }), className)}>
      <RNText className={badgeTextVariants({ tone })}>{label}</RNText>
    </View>
  );
}

export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <View className={cn('gap-3', className)}>
      <Text variant="label">{title}</Text>
      {children}
    </View>
  );
}
