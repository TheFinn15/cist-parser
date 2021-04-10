import {By, WebDriver, WebElement} from "selenium-webdriver";
import {TimeTableType} from "./types/TimeTableType";
import {ExtraInfoType} from "./types/ExtraInfoType";
import {GroupDataType} from "./types/GroupDataType";
import fs from "fs";
import {createObjectCsvWriter} from "csv-writer";


export class CistParser {
  private driver: WebDriver;
  private url: string;
  private readonly typeResult: string;
  private readonly nameResult: string;

  private result: TimeTableType[] = [];
  private curDate: string[] = [];
  private curTime: string[] = [];

  private extraInfo: ExtraInfoType[];
  private allRows: WebElement[];

  private chosenFaculty: { name: string; id: string };
  private chosenGroupID: string[] = [];
  private session: string;
  private rawGroupsData: WebElement[];
  private clearGroupsData: GroupDataType[] = [];

  /**
   *
   * @param driver - WebDriver
   * @param typeResult - Type of result file with time table
   * @param nameResult - Name of file with time table
   */
  constructor(driver: WebDriver, typeResult: string = "json", nameResult: string = "timeTable") {
    this.driver = driver;
    this.typeResult = typeResult;
    this.nameResult = nameResult;
  }

  /**
   * Parse all groups with courses
   */
  async parseGroups() {
    this.session = (await this.driver.getCurrentUrl()).match(/\d{16}/g)?.[0];
    this.rawGroupsData = await this.driver.findElements(By.css("div#GROUPS_AJAX table.t13FormRegion"));

    for (let item of this.rawGroupsData) {
      const curCourse = await item.findElement(By.css("thead th.t13RegionTitle")).getText();
      this.clearGroupsData.push(
        {
          course: curCourse,
          groups: []
        }
      );

      const curGroups = await item.findElements(By.css("tbody td.t13RegionBody a"));

      for (let group of curGroups) {
        const rawGroup: string = await group.getAttribute("onclick");
        const dataGroup: string[] = rawGroup.match(/(\'.*\d)/gm)?.[0].split(",");
        this.clearGroupsData.slice(-1)[0].groups.push(
          {
            id: dataGroup[1],
            name: dataGroup[0].match(/(\'.*\d)/gm)?.[0].replace(/['"]/gm, "")
          }
        );
      }
    }
  }

  /**
   * Take a name of group and return full link to time table
   * @param name group in time table
   */
  async choseGroup(name: string) {
    if (this.clearGroupsData.length > 0) {
      let chosenGroup = [];
      for (const item of this.clearGroupsData) {
        const group = item.groups.filter(i => i.name === name);
        if (group.length > 0)
          chosenGroup.push(group[0]);
      }
      if (chosenGroup.length > 0) {
        this.chosenGroupID[0] = chosenGroup[0].id;
        this.chosenGroupID[1] = chosenGroup[0].name;

        this.url = `https://cist.nure.ua/ias/app/tt/f?p=778:201:${this.session ?? "0000000000000000"}:::201:P201_FIRST_DATE,P201_LAST_DATE,P201_GROUP,P201_POTOK:${CistParser.getDates()[0]},${CistParser.getDates()[1]},${this.chosenGroupID[0]},0:`;

        const pairs = await this.parse();

        try {
          if (this.typeResult === "json") {
            fs.writeFileSync(`${this.nameResult}-${chosenGroup[0].name}.${this.typeResult}`, JSON.stringify(pairs));

            console.log("JSON TIMETABLE SAVED");
          } else if (this.typeResult === "csv") {
            const newCsvFile = createObjectCsvWriter({
              path: `./${this.nameResult}-${chosenGroup[0].name}.${this.typeResult}`,
              header: [
                {id: "name", title: "Название"},
                {id: "time", title: "Время начала"},
                {id: "date", title: "Дата начала"},
                {id: "type", title: "Тип занятия"},
                {id: "cabinet", title: "Кабинет"},
                {id: "fullNameLesson", title: "Доп. Инфо: Полное название"},
                {id: "lectureCounts", title: "Доп. Инфо: Кол-во Лекций"},
                {id: "lectureInfo", title: "Доп. Инфо: О Лекциях"},
                {id: "labaCounts", title: "Доп. Инфо: Кол-во Лаборатнорных"},
                {id: "labaInfo", title: "Доп. Инфо: О Лаборатнорных"},
                {id: "practiceCounts", title: "Доп. Инфо: Кол-во Практических"},
                {id: "practiceInfo", title: "Доп. Инфо: О Практических"},
                {id: "consultCounts", title: "Доп. Инфо: Кол-во Консультациях"},
                {id: "consultInfo", title: "Доп. Инфо: О Консультациях"},
                {id: "examCounts", title: "Доп. Инфо: Кол-во Экзаменов"},
                {id: "examInfo", title: "Доп. Инфо: О Экзаменах"},
                {id: "passCounts", title: "Доп. Инфо: Кол-во Зачетов"},
                {id: "passInfo", title: "Доп. Инфо: О Зачетах"}
              ]
            });

            newCsvFile.writeRecords(CistParser.getDataForCsv(pairs))
              .then(() => console.log("CSV TIMETABLE SAVED"))
              .catch(() => console.error("CSV TIMETABLE NOT SAVED"));
          }
        } catch (e) {
          console.log(`ERROR SAVING TIMETABLE WITH FILE ${this.nameResult}.${this.typeResult}`);
          console.error(e);
        }
      } else {
        throw "Group in time table is not found !";
      }
    } else {
      throw "Data of group is empty";
    }
  }

  async choseFaculty(name: string) {
    await this.driver.get("https://cist.nure.ua/");
    await this.driver.executeScript("doSubmit('T_TIME_TABLE')");

    let res = [];

    const faculties = await this.driver.findElements(By.css("div#GROUPS_AJAX table.htmldbTabbedNavigationList tr td[valign='bottom'] a"));
    for (const faculty of faculties) {
      res.push(
        {
          id: (await faculty.getAttribute("onclick")).match(/\d+/g)[0],
          name: await faculty.getText()
        }
      );
    }

    this.chosenFaculty = res.filter(i => i.name === name)[0];

    await this.driver.executeScript(`IAS_Change_Groups(${this.chosenFaculty.id})`);
  }

  private async parse() : Promise<TimeTableType[]> {
    await this.driver.get(this.url);

    this.allRows = (await this.driver.findElements(By.css("table.MainTT tr"))).slice(1);

    this.result = await this.getPairs();
    await this.analyzeTypeLesson();

    return this.result;
  }

  private async analyzeTypeLesson() {
    this.extraInfo = await this.getMappedExtras(await this.driver.findElements(By.css("table.footer tr")));

    for (let i = 0; i < this.result.length; i++) {
      const item = this.result[i];
      if (item.name.length > 0) {
        const curExtra = this.extraInfo.filter(i => i.shortName === item.name)[0];
        if (item.name === curExtra.shortName) {
          item.extraInfo = curExtra;
        }
      }
    }
  }

  private async getPairs() : Promise<TimeTableType[]> {
    const result: TimeTableType[] = [];

    let countRowTime = 0;

    for (const row of this.allRows) {
      let countRowDate = 0;
      if (countRowDate > countRowTime) countRowTime++;
      else if (countRowTime >= 6) countRowTime = 0;

      for (const i of (await row.findElements(By.css("td"))).slice(1)) {
        const regex = /\d{2}\.\d{2}\.\d{4}|\d{2}:\d{2}/g;
        if ((await i.getText()).match(regex) !== null) {
          const timeOrDate = (await i.getText());

          if (timeOrDate.match(/\d{2}\.\d{2}\.\d{4}/g) !== null) {
            this.curDate.push(
              timeOrDate.match(/\d{2}\.\d{2}\.\d{4}/g)[0]
            );
          }
          if (timeOrDate.match(/\d{2}:\d{2}/g) !== null) {
            this.curTime.push(
              timeOrDate.match(/\d{2}:\d{2}/g).join(" - ")
            );
          }
        } else {
          if (await i.getText() !== " ") {
            let [title, type, cabinet, numCabinet] = (await i.getText()).split(" ");
            numCabinet = numCabinet ?? "";
            result.push(
              {
                name: title,
                time: this.curTime[countRowTime],
                date: this.curDate[countRowDate],
                type: type,
                cabinet: cabinet + " " + numCabinet
              }
            )
          } else {
            result.push(
              {
                name: "",
                time: this.curTime[countRowTime],
                date: this.curDate[countRowDate],
                type: "",
                cabinet: ""
              }
            )
          }
          countRowDate++;
        }
      }
    }
    return result;
  }

  private async getMappedExtras(info: WebElement[]) : Promise<ExtraInfoType[]> {
    const res: ExtraInfoType[] = [];

    for (const item of info) {
      const curTitle = await item.findElement(By.className("name")).getText();
      const curInfo = await (await item.findElements(By.css("td")))[1].getText();
      const [fullTitle, ...counts] = curInfo.split(":");

      res.push({
        shortName: curTitle,
        fullName: fullTitle,
        countsLessons: {
          lecture: {
            info: counts.filter(i => i.match(/ Лк /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Лк ")
          },
          laba: {
            info: counts.filter(i => i.match(/ Лб /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Лб ")
          },
          practice: {
            info: counts.filter(i => i.match(/ Пз /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Пз ")
          },
          consult: {
            info: counts.filter(i => i.match(/ Конс /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Конс ")
          },
          exam: {
            info: counts.filter(i => i.match(/ ІспКомб /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," ІспКомб ")
          },
          pass: {
            info: counts.filter(i => i.match(/ Зал /g))[0]?.split(" - ")[1],
            counts: this.getCountTypesLearn(counts," Зал ")
          }
        }
      });
    }
    return res;
  }

  private getCountTypesLearn(arr: string[], type: string) {
    return parseInt(arr.filter(i => new RegExp(type, "g").exec(i))[0]?.match(/\d+/g)[0]);
  }

  private static getDataForCsv(rawData: TimeTableType[]) : any[] {
    let result: any[] = [];
    for (const item of rawData) {
      result.push(
        {
          name: item.name,
          time: item.time,
          date: item.date,
          type: item.type,
          cabinet: item.cabinet,
          fullNameLesson: item.extraInfo?.fullName,
          lectureCounts: item.extraInfo?.countsLessons.lecture.counts,
          lectureInfo: item.extraInfo?.countsLessons.lecture.info,
          labaCounts: item.extraInfo?.countsLessons.laba.counts,
          labaInfo: item.extraInfo?.countsLessons.laba.info,
          practiceCounts: item.extraInfo?.countsLessons.practice.counts,
          practiceInfo: item.extraInfo?.countsLessons.practice.info,
          consultCounts: item.extraInfo?.countsLessons.consult.counts,
          consultInfo: item.extraInfo?.countsLessons.consult.info,
          examCounts: item.extraInfo?.countsLessons.exam.counts,
          examInfo: item.extraInfo?.countsLessons.exam.info,
          passCounts: item.extraInfo?.countsLessons.pass.counts,
          passInfo: item.extraInfo?.countsLessons.pass.info,
        }
      );
    }

    return result;
  }

  private static getDates(): string[] {
    const [day, month, year] = new Date(Date.now()).toLocaleString().split(",")[0].split(".");
    let startDate = "";
    let endDate = "";
    if (month > "01") {
      startDate = `01.02.${parseInt(year)}`
      endDate = `30.07.${parseInt(year)}`
    } else if (month <= "01") {
      startDate = `01.09.${parseInt(year)}`
      endDate = `30.01.${parseInt(year)+1}`
    }

    return [startDate, endDate];
  }
}
