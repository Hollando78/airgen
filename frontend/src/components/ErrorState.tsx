export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="alert alert-error" role="alert">
      <strong>Error:</strong> {message}
    </div>
  );
}
