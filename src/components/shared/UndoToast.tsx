interface Props {
  message: string;
  onUndo: (() => void) | null;
  onClose: () => void;
}

export default function UndoToast({ message, onUndo, onClose }: Props) {
  return (
    <div className="sb-toast">
      <span>{message}</span>
      {onUndo && (
        <button onClick={() => { onUndo(); onClose(); }}>Hoàn tác</button>
      )}
    </div>
  );
}
