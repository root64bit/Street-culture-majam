export default function ProductLoading() {
  return (
    <main
      aria-label="Loading product"
      aria-busy="true"
      className="min-h-screen animate-pulse bg-[#f7f6f2] px-4 pb-24 pt-32 sm:px-6 lg:px-10"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="h-3 w-32 rounded-full bg-black/10" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="aspect-square rounded-[2rem] bg-black/10" />
          <div className="space-y-5 pt-4">
            <div className="h-3 w-24 rounded-full bg-black/10" />
            <div className="h-20 rounded-2xl bg-black/10" />
            <div className="h-10 w-44 rounded-xl bg-black/10" />
            <div className="h-24 rounded-2xl bg-black/10" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-14 rounded-full bg-black/10" />
              <div className="h-14 rounded-full bg-black/10" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
