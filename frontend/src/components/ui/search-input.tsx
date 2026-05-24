import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Collapsible search input. Renders as an icon button when idle; expands to
 * a text input on click. Clearing the input also collapses it.
 *
 * Pair with useDebounce in the parent so API requests only fire after the
 * user pauses typing, not on every keystroke.
 *
 * Example:
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebounce(search, 300);
 *   // pass debouncedSearch to your query, search to SearchInput
 */
export function SearchInput({ value, onChange, placeholder = "Search…", className }: SearchInputProps) {
  const [open, setOpen] = useState(() => !!value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (value) setOpen(true);
  }, [value]);

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 w-7 px-0", className)}
        title="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
      </Button>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        className="h-7 pl-8 pr-7 text-xs w-full"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Escape" && handleClear()}
      />
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={handleClear}
        aria-label="Clear search"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
