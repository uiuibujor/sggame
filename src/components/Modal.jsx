function Modal({ open, onClose, title, width = "normal", children }) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-box ${width === "wide" ? "wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
