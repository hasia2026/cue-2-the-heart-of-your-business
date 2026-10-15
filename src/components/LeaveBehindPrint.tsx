"use client";

// Client pieces of the print-edition leave-behind. Kept in a separate
// "use client" file so the page itself can stay a server component.
export function PrintOnce() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{if(!new URLSearchParams(location.search).has("noprint"))setTimeout(function(){window.print()},350);}catch(e){}`,
      }}
    />
  );
}

export function PrintLink() {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.print();
      }}
      style={{ color: "#2E8BFF" }}
    >
      click here
    </a>
  );
}
