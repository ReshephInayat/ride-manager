import logo from "@/assets/logo.png";

export function Logo({
  className = "",
  withBg = true,
}: {
  className?: string;
  withBg?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md ${
        withBg ? "bg-slate-900 px-2 py-1" : ""
      } ${className}`}
    >
      <img
        src={logo}
        alt="Puget Sound Limo"
        className="h-6 w-auto object-contain select-none"
        draggable={false}
      />
    </span>
  );
}
