export function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-danger mt-1">{message}</p>;
}