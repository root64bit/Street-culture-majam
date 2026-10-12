export default function ShopLoading() {
  return (
    <main
      aria-label="Loading catalog"
      aria-busy="true"
      className="min-h-screen animate-pulse bg-[#f7f6f2] px-4 pb-24 pt-32 sm:px-6 lg:px-10"
    >
      <div className="mx-auto max-w-[1500px]">
        <div className="h-3 w-24 rounded-full bg-black/10" />
        <div className="mt-12 h-16 max-w-3xl rounded-2xl bg-black/10 sm:h-24" />
        <div className="mt-16 grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="hidden h-[620px] rounded-[1.75rem] bg-black/5 lg:block" />
          <div>
            <div className="h-10 w-40 rounded-xl bg-black/10" />
            <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index}>
                  <div className="aspect-[0.84] rounded-2xl bg-black/10" />
                  <div className="mt-3 h-4 w-2/3 rounded-full bg-black/10" />
                  <div className="mt-2 h-5 rounded-full bg-black/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
