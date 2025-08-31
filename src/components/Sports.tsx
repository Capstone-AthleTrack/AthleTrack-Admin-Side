import { BRAND } from "@/brand";
import NavBar from "@/components/NavBar";
import { Link } from "react-router-dom";

const sports = [
  { id: 1, name: "Baseball" },
  { id: 2, name: "Basketball" },
  { id: 3, name: "Volleyball" },
  { id: 4, name: "Beach Volleyball" },
  { id: 5, name: "Football" },
  { id: 6, name: "Softball" },
  { id: 7, name: "Futsal" },
  { id: 8, name: "Sepak-Takraw" },
];

export default function Sports() {
  return (
    <div>
      <NavBar />
      <section id="sports-section" className="mx-auto w-full px-8 pb-16">
        <div className="mt-4 rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="text-3xl font-semibold text-center mb-8">List of Sports</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {sports.map((s) => (
              <div key={s.id} className="flex flex-col items-center">
                <Link
                  to={`/sports/${encodeURIComponent(s.name)}`}
                  className="w-full h-40 rounded-2xl shadow-lg transition-transform duration-200 ease-in-out hover:scale-105 focus:outline-none flex justify-center items-center text-white font-semibold text-lg"
                  aria-label={s.name}
                  style={{ backgroundColor: BRAND.maroon }}
                >
                  {s.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
